import type {
  HereDocOpener,
  HereDocOpenerMatch,
  SeparatorPosition,
  ShellSyntax,
  TokenSpan,
} from "./shell-grammar.types.js";

/**
 * The shell whose quote/escape grammar governs decomposition. Resolved from the command tool name
 * (Bash vs PowerShell) so a `\"` is read as a literal quote in Bash but a path char in PowerShell.
 */
export const SHELL = {
  BASH: "bash",
  POWERSHELL: "powershell",
} as const;

export type ShellDialect = (typeof SHELL)[keyof typeof SHELL];

export const SINGLE_QUOTE = "'";
export const DOUBLE_QUOTE = '"';
export const BLOCK_OPEN = "{";
export const BLOCK_CLOSE = "}";
export const PAREN_OPEN = "(";
export const PAREN_CLOSE = ")";
export const DOLLAR = "$";
export const SUBSTITUTION_MARKER = "$";

const REDIRECT_CHAR = ">";
const LINE_FEED = "\n";
const CARRIAGE_RETURN = "\r";
const TAB = "\t";
const ARRAY_SUBEXPRESSION_MARKER = "@";
const HEREDOC_CHAR = "<";
const HEREDOC_OPERATOR = "<<";
const HEREDOC_TAB_STRIP = "-";
const HEREDOC_WORD_TERMINATORS = " \t\n\r;|&<>()";
/** Characters a `<<` may follow to be a heredoc redirect rather than a glued arithmetic left shift. */
const HEREDOC_OPENER_PRECEDERS = " \t\n\r;|&";
const HERE_STRING_MARKER = "@";

const BASH_COMMAND_LIST_KEYWORDS = ["if", "then", "elif", "else", "while", "until", "do"];
const BASH_STANDALONE_KEYWORDS = ["done", "fi", "esac", "}"];
const BASH_WORD_LIST_HEADER_KEYWORDS = ["for", "select", "case"];
const POWERSHELL_STANDALONE_KEYWORDS = [
  "if",
  "elseif",
  "else",
  "foreach",
  "for",
  "while",
  "do",
  "until",
  "switch",
  "try",
  "catch",
  "finally",
];
const POWERSHELL_EXPRESSION_LEAF_OPENERS = [DOLLAR, DOUBLE_QUOTE, SINGLE_QUOTE, "["];

export const SHELL_SYNTAX: Record<ShellDialect, ShellSyntax> = {
  [SHELL.BASH]: {
    escapeChar: "\\",
    singleQuoteEmbedded: false,
    doubleQuoteEmbedded: false,
    scriptBlock: false,
    hereDoc: true,
    arithmetic: true,
    hereString: false,
    commandSubstitution: true,
    arraySubexpression: false,
    bashAssignmentPrefix: true,
    variableAssignmentPrefix: false,
    commandListKeywords: BASH_COMMAND_LIST_KEYWORDS,
    standaloneKeywords: BASH_STANDALONE_KEYWORDS,
    wordListHeaderKeywords: BASH_WORD_LIST_HEADER_KEYWORDS,
    expressionLeafOpeners: [],
    expressionLeafDropsLeadingDigit: false,
    unmatchedCloseParenSeparator: true,
    twoCharSeparators: ["&&", "||", "|&"],
    singleCharSeparators: [";", "|", "&", "\n", "\r"],
  },
  [SHELL.POWERSHELL]: {
    escapeChar: "`",
    singleQuoteEmbedded: true,
    doubleQuoteEmbedded: true,
    scriptBlock: true,
    hereDoc: false,
    arithmetic: false,
    hereString: true,
    commandSubstitution: true,
    arraySubexpression: true,
    bashAssignmentPrefix: false,
    variableAssignmentPrefix: true,
    commandListKeywords: [],
    standaloneKeywords: POWERSHELL_STANDALONE_KEYWORDS,
    wordListHeaderKeywords: [],
    expressionLeafOpeners: POWERSHELL_EXPRESSION_LEAF_OPENERS,
    expressionLeafDropsLeadingDigit: true,
    unmatchedCloseParenSeparator: false,
    twoCharSeparators: ["&&", "||"],
    singleCharSeparators: [";", "|", "&", "\n", "\r"],
  },
};

/**
 * Given a quote opening at `openIndex`, return the index just past its close under the shell's
 * grammar, or `undefined` when the quote is never closed. Escapes and embedded-quote doublings are
 * consumed but never rewritten — this only locates the boundary. An unterminated quote returns
 * `undefined` so the caller can fall back to scanning through it (never hide a later separator).
 */
function findQuoteEnd(command: string, openIndex: number, syntax: ShellSyntax): number | undefined {
  const quoteChar = command[openIndex];
  const isDouble = quoteChar === DOUBLE_QUOTE;
  const embedded = isDouble ? syntax.doubleQuoteEmbedded : syntax.singleQuoteEmbedded;
  let index = openIndex + 1;

  while (index < command.length) {
    const char = command[index];

    if (isDouble && char === syntax.escapeChar && index + 1 < command.length) {
      index += 2;
      continue;
    }

    if (char === quoteChar) {
      if (embedded && command[index + 1] === quoteChar) {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index += 1;
  }

  return undefined;
}

/**
 * If an inert region starts at `index` — an escape pair, a quoted region, or a here-string — return
 * the index just past it; otherwise `undefined`. This is the single skip primitive shared by every
 * scanner and by {@link findBalancedEnd}, so all of them agree on what text is opaque. Fallbacks are
 * the fail-toward-splitting convention: an unterminated quote yields `index + 1` and a rejected
 * here-string pair yields `index + 2`, so a stray quote or `@'` can never open a region-spanning scan
 * that swallows a following separator.
 */
export function skipInertRegion(text: string, index: number, syntax: ShellSyntax): number | undefined {
  const char = text[index];

  if (char === syntax.escapeChar && index + 1 < text.length) {
    return index + 2;
  }

  if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
    const end = findQuoteEnd(text, index, syntax);
    return end ?? index + 1;
  }

  if (syntax.hereString && isHereStringQuotePair(text, index)) {
    const end = isHereStringOpener(text, index) ? findHereStringEnd(text, index) : undefined;
    return end ?? index + 2;
  }

  return undefined;
}

/**
 * Given a balanced-delimiter opening `openChar` at `openIndex`, return the index just past its
 * matching `closeChar` under the shell's grammar, tracking nesting and skipping inert regions (so a
 * delimiter inside a quote or here-string does not count). Returns `undefined` when never closed, so
 * the caller falls back to scanning through the opener and any inner separator still splits (fail
 * toward splitting). Used for both `{`/`}` script blocks and `(`/`)` command substitutions.
 */
export function findBalancedEnd(
  text: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
  syntax: ShellSyntax
): number | undefined {
  let depth = 0;
  let index = openIndex;

  while (index < text.length) {
    const inertEnd = skipInertRegion(text, index, syntax);
    if (inertEnd !== undefined) {
      index = inertEnd;
      continue;
    }

    const char = text[index];

    if (char === openChar) {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return index;
      }

      continue;
    }

    index += 1;
  }

  return undefined;
}

/** Return the length of the shell separator starting at `index`, or `undefined` if none. */
function separatorLengthAt(command: string, index: number, syntax: ShellSyntax): number | undefined {
  const twoChar = command.slice(index, index + 2);
  for (const separator of syntax.twoCharSeparators) {
    if (twoChar === separator) {
      return separator.length;
    }
  }

  const char = command[index];
  if (char === "&") {
    // Guard shell redirects (`2>&1`, `&>file`) from being read as a background separator.
    if (command[index - 1] === REDIRECT_CHAR || command[index + 1] === REDIRECT_CHAR) {
      return undefined;
    }
  }

  for (const separator of syntax.singleCharSeparators) {
    if (char === separator) {
      return separator.length;
    }
  }

  return undefined;
}

function isLineTerminator(char: string): boolean {
  return char === LINE_FEED || char === CARRIAGE_RETURN;
}

/** Length of the line terminator at `index` (`\r\n` counts as one), or 0 if there is none. */
function lineTerminatorLength(command: string, index: number): number {
  if (command[index] === CARRIAGE_RETURN && command[index + 1] === LINE_FEED) {
    return 2;
  }

  return isLineTerminator(command[index]) ? 1 : 0;
}

/** Index where the line starting at `from` ends (first line terminator, or end of input). */
function lineContentEnd(command: string, from: number): number {
  let index = from;
  while (index < command.length && !isLineTerminator(command[index])) {
    index += 1;
  }

  return index;
}

function stripLeadingTabs(line: string): string {
  let index = 0;
  while (line[index] === TAB) {
    index += 1;
  }

  return line.slice(index);
}

/**
 * A `<<`/`<<-` heredoc operator in redirect position: at start-of-input or following whitespace or a
 * separator. A `<<` glued to a preceding token is an arithmetic left shift (`1<<3`, `let y=1<<4`), not
 * a redirect; a `<<<` here-string and a longer `<` run are excluded by the same preceder/next checks.
 */
function isHereDocOperator(command: string, index: number): boolean {
  if (command.slice(index, index + HEREDOC_OPERATOR.length) !== HEREDOC_OPERATOR) {
    return false;
  }

  if (index !== 0 && !HEREDOC_OPENER_PRECEDERS.includes(command[index - 1])) {
    return false;
  }

  return command[index + HEREDOC_OPERATOR.length] !== HEREDOC_CHAR;
}

/**
 * Parse a heredoc opener at `operatorIndex`, returning its unquoted delimiter and the index just past
 * the delimiter word. `undefined` when there is no delimiter, so `<<` falls back to ordinary chars.
 */
function parseHereDocOpener(command: string, operatorIndex: number, syntax: ShellSyntax): HereDocOpenerMatch | undefined {
  let cursor = operatorIndex + HEREDOC_OPERATOR.length;

  const stripTabs = command[cursor] === HEREDOC_TAB_STRIP;
  if (stripTabs) {
    cursor += 1;
  }

  while (command[cursor] === " " || command[cursor] === TAB) {
    cursor += 1;
  }

  let delimiter = "";
  while (cursor < command.length) {
    const char = command[cursor];
    if (HEREDOC_WORD_TERMINATORS.includes(char)) {
      break;
    }

    if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
      const end = findQuoteEnd(command, cursor, syntax);
      if (end === undefined) {
        return undefined;
      }

      delimiter += command.slice(cursor + 1, end - 1);
      cursor = end;
      continue;
    }

    if (char === syntax.escapeChar && cursor + 1 < command.length) {
      delimiter += command[cursor + 1];
      cursor += 2;
      continue;
    }

    delimiter += char;
    cursor += 1;
  }

  if (delimiter.length === 0) {
    return undefined;
  }

  return { opener: { delimiter, stripTabs }, nextIndex: cursor };
}

/**
 * Given the heredoc openers pending after an opener line, return the index at the end of the last
 * terminator line's content, consuming each opener's body in order. `undefined` when any terminator
 * is missing, so the caller falls back to normal scanning (an unterminated heredoc over-splits its
 * body rather than hiding a later command).
 */
function findHereDocBodyEnd(command: string, bodyStart: number, openers: readonly HereDocOpener[]): number | undefined {
  let cursor = bodyStart;

  for (let openerIndex = 0; openerIndex < openers.length; openerIndex += 1) {
    const opener = openers[openerIndex];
    const isLastOpener = openerIndex === openers.length - 1;
    let terminated = false;

    while (cursor <= command.length) {
      const contentEnd = lineContentEnd(command, cursor);
      const line = command.slice(cursor, contentEnd);
      const compared = opener.stripTabs ? stripLeadingTabs(line) : line;

      if (compared === opener.delimiter) {
        if (isLastOpener) {
          return contentEnd;
        }

        cursor = contentEnd + lineTerminatorLength(command, contentEnd);
        terminated = true;
        break;
      }

      if (contentEnd >= command.length) {
        return undefined;
      }

      cursor = contentEnd + lineTerminatorLength(command, contentEnd);
    }

    if (!terminated) {
      return undefined;
    }
  }

  return undefined;
}

/** An `@` immediately followed by a quote — the shape of a here-string opener `@'`/`@"`. */
function isHereStringQuotePair(text: string, index: number): boolean {
  if (text[index] !== HERE_STRING_MARKER) {
    return false;
  }

  const quoteChar = text[index + 1];
  return quoteChar === SINGLE_QUOTE || quoteChar === DOUBLE_QUOTE;
}

/** A here-string opener `@'`/`@"` that is the last token on its line (its body starts on the next). */
function isHereStringOpener(text: string, index: number): boolean {
  return isHereStringQuotePair(text, index) && isLineTerminator(text[index + 2]);
}

/**
 * Given a here-string opener at `openIndex`, return the index just past the closing `'@`/`"@` that
 * begins a line, or `undefined` when it is never closed (caller falls back to scanning through the
 * opener so a later separator still splits — same fail-toward-splitting convention as findQuoteEnd).
 */
function findHereStringEnd(text: string, openIndex: number): number | undefined {
  const closer = text[openIndex + 1] + HERE_STRING_MARKER;
  const openerTerminator = openIndex + 2;
  let lineStart = openerTerminator + lineTerminatorLength(text, openerTerminator);

  while (lineStart <= text.length) {
    if (text.slice(lineStart, lineStart + closer.length) === closer) {
      return lineStart + closer.length;
    }

    const contentEnd = lineContentEnd(text, lineStart);
    if (contentEnd >= text.length) {
      return undefined;
    }

    lineStart = contentEnd + lineTerminatorLength(text, contentEnd);
  }

  return undefined;
}

/**
 * Scan the command for top-level separators, skipping inert regions ({@link skipInertRegion}) and
 * script blocks. A Bash heredoc body is skipped by emitting its opener line's terminator separator
 * with a `length` extended through the terminator line, so scanning resumes past the body without
 * touching `splitSubcommands`.
 */
function findSeparatorPositions(command: string, syntax: ShellSyntax): SeparatorPosition[] {
  const positions: SeparatorPosition[] = [];
  let pendingHereDocs: HereDocOpener[] = [];
  let arithmeticDepth = 0;
  let index = 0;

  while (index < command.length) {
    const inertEnd = skipInertRegion(command, index, syntax);
    if (inertEnd !== undefined) {
      index = inertEnd;
      continue;
    }

    const char = command[index];

    if (syntax.scriptBlock && char === BLOCK_OPEN) {
      const end = findBalancedEnd(command, index, BLOCK_OPEN, BLOCK_CLOSE, syntax);
      // Unbalanced block: fall through the `{` so an inner separator still splits (fail toward split).
      index = end ?? index + 1;
      continue;
    }

    if (syntax.arithmetic && char === PAREN_OPEN && command[index + 1] === PAREN_OPEN) {
      arithmeticDepth += 1;
      index += 2;
      continue;
    }

    if (syntax.arithmetic && arithmeticDepth > 0 && char === PAREN_CLOSE && command[index + 1] === PAREN_CLOSE) {
      arithmeticDepth -= 1;
      index += 2;
      continue;
    }

    if (char === PAREN_OPEN) {
      // A bare `( … )` grouping or subshell is a balanced region: a separator inside it is internal,
      // and its matching `)` is consumed here so a `)` reached later is unmatched by construction.
      // Unbalanced falls through as `index + 1`, the same fail-toward-splitting convention as `{`.
      const end = findBalancedEnd(command, index, PAREN_OPEN, PAREN_CLOSE, syntax);
      index = end ?? index + 1;
      continue;
    }

    if (syntax.unmatchedCloseParenSeparator && char === PAREN_CLOSE) {
      // A `)` the scan reaches closes nothing — every matched `( … )` was consumed above — so it is a
      // case-pattern terminator: a separator, so the pattern body is its own subcommand.
      positions.push({ index, length: 1 });
      index += 1;
      continue;
    }

    if (syntax.hereDoc && arithmeticDepth === 0 && isHereDocOperator(command, index)) {
      const match = parseHereDocOpener(command, index, syntax);
      if (match !== undefined) {
        pendingHereDocs.push(match.opener);
        index = match.nextIndex;
        continue;
      }
    }

    const length = separatorLengthAt(command, index, syntax);
    if (length !== undefined) {
      if (pendingHereDocs.length > 0 && isLineTerminator(char)) {
        const bodyStart = index + lineTerminatorLength(command, index);
        const bodyEnd = findHereDocBodyEnd(command, bodyStart, pendingHereDocs);
        pendingHereDocs = [];
        if (bodyEnd !== undefined) {
          positions.push({ index, length: bodyEnd - index });
          index = bodyEnd;
          continue;
        }
      }

      positions.push({ index, length });
      index += length;
      continue;
    }

    index += 1;
  }

  return positions;
}

/**
 * Split a compound command into its top-level subcommands, preserving each as a literal slice of the
 * original (outer whitespace trimmed, empties dropped). Boundaries respect the shell's inert regions,
 * so separators inside quotes, here-strings, or escaped are not split on.
 */
export function splitSubcommandsBySyntax(command: string, syntax: ShellSyntax): string[] {
  const subcommands: string[] = [];
  let start = 0;

  const pushSegment = (end: number): void => {
    const trimmed = command.slice(start, end).trim();
    if (trimmed.length > 0) {
      subcommands.push(trimmed);
    }
  };

  for (const position of findSeparatorPositions(command, syntax)) {
    pushSegment(position.index);
    start = position.index + position.length;
  }

  pushSegment(command.length);
  return subcommands;
}

/**
 * The index of the opening `(` of a `$( … )` command substitution at `index`, or `undefined` if none.
 * `$(` in both shells; a Bash `$((` is arithmetic and is excluded. Unlike {@link substitutionOpenParen}
 * this never matches a PowerShell `@( … )`, which does not interpolate inside a string literal.
 */
export function commandSubstitutionOpenParen(command: string, index: number, syntax: ShellSyntax): number | undefined {
  if (syntax.commandSubstitution && command[index] === SUBSTITUTION_MARKER && command[index + 1] === PAREN_OPEN) {
    if (syntax.arithmetic && command[index + 2] === PAREN_OPEN) {
      return undefined;
    }

    return index + 1;
  }

  return undefined;
}

/**
 * The index of the opening `(` of a command substitution at `index`, or `undefined` if none. `$(` in
 * both shells; PowerShell `@(` as well. A Bash `$((` is arithmetic and is excluded.
 */
export function substitutionOpenParen(command: string, index: number, syntax: ShellSyntax): number | undefined {
  const commandSubstitution = commandSubstitutionOpenParen(command, index, syntax);
  if (commandSubstitution !== undefined) {
    return commandSubstitution;
  }

  if (syntax.arraySubexpression && command[index] === ARRAY_SUBEXPRESSION_MARKER && command[index + 1] === PAREN_OPEN) {
    return index + 1;
  }

  return undefined;
}

/** Locate whitespace-delimited token spans in a single subcommand, skipping inert regions and blocks. */
export function tokenSpans(subcommand: string, syntax: ShellSyntax): TokenSpan[] {
  const spans: TokenSpan[] = [];
  let index = 0;

  while (index < subcommand.length) {
    while (index < subcommand.length && (subcommand[index] === " " || subcommand[index] === "\t")) {
      index += 1;
    }

    if (index >= subcommand.length) {
      break;
    }

    const start = index;
    while (index < subcommand.length) {
      const char = subcommand[index];
      if (char === " " || char === "\t") {
        break;
      }

      const inertEnd = skipInertRegion(subcommand, index, syntax);
      if (inertEnd !== undefined) {
        index = inertEnd;
        continue;
      }

      if (syntax.scriptBlock && char === BLOCK_OPEN) {
        // Keep a whole `{ … }` block as one token so its inner whitespace does not fragment it and a
        // derived prefix covers the entire script block rather than cutting into it.
        const end = findBalancedEnd(subcommand, index, BLOCK_OPEN, BLOCK_CLOSE, syntax);
        index = end ?? index + 1;
        continue;
      }

      if (char === PAREN_OPEN) {
        // Keep a whole `( … )` as one token so a derived prefix covers an argument list or grouping
        // expression rather than cutting into it (`[regex]::Matches($b, '…')` stays one token).
        const end = findBalancedEnd(subcommand, index, PAREN_OPEN, PAREN_CLOSE, syntax);
        index = end ?? index + 1;
        continue;
      }

      index += 1;
    }

    spans.push({ start, end: index });
  }

  return spans;
}
