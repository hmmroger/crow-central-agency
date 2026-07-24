import { matchesSpecifier, WORD_BOUNDARY_SUFFIX } from "@crow-central-agency/shared";

/** Number of non-flag tokens a derived prefix keeps before wildcarding the rest. */
export const DEFAULT_PREFIX_DEPTH = 3;

/**
 * How a compound command aggregates per-subcommand matches. `ALL` (approve) requires every
 * subcommand to match a specifier; `ANY` (deny) fires when a single subcommand matches.
 */
export const SUBCOMMAND_MATCH_MODE = {
  ALL: "all",
  ANY: "any",
} as const;

export type SubcommandMatchMode = (typeof SUBCOMMAND_MATCH_MODE)[keyof typeof SUBCOMMAND_MATCH_MODE];

/** Maximum number of rules derived from a single compound command, mirroring the SDK cap. */
export const MAX_DERIVED_RULES = 5;

/**
 * The shell whose quote/escape grammar governs decomposition. Resolved from the command tool name
 * (Bash vs PowerShell) so a `\"` is read as a literal quote in Bash but a path char in PowerShell.
 */
export const SHELL = {
  BASH: "bash",
  POWERSHELL: "powershell",
} as const;

export type ShellDialect = (typeof SHELL)[keyof typeof SHELL];

const OPTION_PREFIX = "-";
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const REDIRECT_CHAR = ">";
const BLOCK_OPEN = "{";
const BLOCK_CLOSE = "}";

interface ShellSyntax {
  /** Escapes the next char outside quotes and inside double quotes (Bash `\`, PowerShell backtick). */
  readonly escapeChar: string;
  /** Whether a doubled single quote (`''`) is an embedded quote that keeps the string open. */
  readonly singleQuoteEmbedded: boolean;
  /** Whether a doubled double quote (`""`) is an embedded quote that keeps the string open. */
  readonly doubleQuoteEmbedded: boolean;
  /**
   * Whether `{ … }` is an opaque script block whose inner separators are internal, not top-level
   * (PowerShell `Where-Object { … }`, `if (…) { … }`). Off for Bash, where `{ …; …; }` is a brace
   * group whose `;` separates real commands — grouping there would hide a subcommand.
   */
  readonly scriptBlock: boolean;
  readonly twoCharSeparators: readonly string[];
  readonly singleCharSeparators: readonly string[];
}

interface SeparatorPosition {
  readonly index: number;
  readonly length: number;
}

interface TokenSpan {
  readonly start: number;
  readonly end: number;
}

const SHELL_SYNTAX: Record<ShellDialect, ShellSyntax> = {
  [SHELL.BASH]: {
    escapeChar: "\\",
    singleQuoteEmbedded: false,
    doubleQuoteEmbedded: false,
    scriptBlock: false,
    twoCharSeparators: ["&&", "||", "|&"],
    singleCharSeparators: [";", "|", "&", "\n", "\r"],
  },
  [SHELL.POWERSHELL]: {
    escapeChar: "`",
    singleQuoteEmbedded: true,
    doubleQuoteEmbedded: true,
    scriptBlock: true,
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
 * Given a script block opening `{` at `openIndex`, return the index just past its matching `}` under
 * the shell's grammar, tracking nesting and skipping quoted/escaped regions (so a `}` inside a quote
 * does not close the block). Returns `undefined` when the block is never closed, so the caller falls
 * back to scanning through the `{` and any inner separator still splits (fail toward splitting).
 */
function findBlockEnd(command: string, openIndex: number, syntax: ShellSyntax): number | undefined {
  let depth = 0;
  let index = openIndex;

  while (index < command.length) {
    const char = command[index];

    if (char === syntax.escapeChar && index + 1 < command.length) {
      index += 2;
      continue;
    }

    if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
      const end = findQuoteEnd(command, index, syntax);
      index = end ?? index + 1;
      continue;
    }

    if (char === BLOCK_OPEN) {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === BLOCK_CLOSE) {
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

/** Scan the command for top-level separators, skipping quoted regions and escaped characters. */
function findSeparatorPositions(command: string, syntax: ShellSyntax): SeparatorPosition[] {
  const positions: SeparatorPosition[] = [];
  let index = 0;

  while (index < command.length) {
    const char = command[index];

    if (char === syntax.escapeChar && index + 1 < command.length) {
      index += 2;
      continue;
    }

    if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
      const end = findQuoteEnd(command, index, syntax);
      // Unterminated quote: treat the opening quote as a literal char and keep scanning so a later
      // separator is still found (fail toward splitting, never toward hiding a command).
      index = end ?? index + 1;
      continue;
    }

    if (syntax.scriptBlock && char === BLOCK_OPEN) {
      const end = findBlockEnd(command, index, syntax);
      // Unbalanced block: fall through the `{` so an inner separator still splits (fail toward split).
      index = end ?? index + 1;
      continue;
    }

    const length = separatorLengthAt(command, index, syntax);
    if (length !== undefined) {
      positions.push({ index, length });
      index += length;
      continue;
    }

    index += 1;
  }

  return positions;
}

/**
 * Split a compound command into its top-level subcommands, preserving each as a literal slice of
 * the original (outer whitespace trimmed, empties dropped). Boundaries respect the shell's quote
 * and escape grammar, so separators inside quotes or escaped are not split on.
 */
export function splitSubcommands(command: string, shell: ShellDialect): string[] {
  const syntax = SHELL_SYNTAX[shell];
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

/** Locate whitespace-delimited token spans in a single subcommand, skipping quoted regions. */
function tokenSpans(subcommand: string, syntax: ShellSyntax): TokenSpan[] {
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

      if (char === syntax.escapeChar && index + 1 < subcommand.length) {
        index += 2;
        continue;
      }

      if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
        const end = findQuoteEnd(subcommand, index, syntax);
        index = end ?? index + 1;
        continue;
      }

      if (syntax.scriptBlock && char === BLOCK_OPEN) {
        // Keep a whole `{ … }` block as one token so its inner whitespace does not fragment it and a
        // derived prefix covers the entire script block rather than cutting into it.
        const end = findBlockEnd(subcommand, index, syntax);
        index = end ?? index + 1;
        continue;
      }

      index += 1;
    }

    spans.push({ start, end: index });
  }

  return spans;
}

/**
 * Derive one flag-aware prefix specifier for a single already-decomposed subcommand: keep the first
 * {@link DEFAULT_PREFIX_DEPTH} non-flag tokens (a `-`/`--` flag and its following value are kept but
 * not counted), then take that literal prefix of the source plus {@link WORD_BOUNDARY_SUFFIX}.
 * `undefined` when there is no non-flag token (e.g. a lone `--flag`). Never re-splits the subcommand.
 */
function derivePrefixSpecifier(subcommand: string, syntax: ShellSyntax, depth: number): string | undefined {
  const spans = tokenSpans(subcommand, syntax);
  let counted = 0;
  let lastKeptEnd = -1;
  let index = 0;

  while (index < spans.length && counted < depth) {
    const text = subcommand.slice(spans[index].start, spans[index].end);

    if (text.startsWith(OPTION_PREFIX)) {
      lastKeptEnd = spans[index].end;
      index += 1;
      const next = spans[index];
      if (next !== undefined && !subcommand.slice(next.start, next.end).startsWith(OPTION_PREFIX)) {
        lastKeptEnd = next.end;
        index += 1;
      }

      continue;
    }

    lastKeptEnd = spans[index].end;
    counted += 1;
    index += 1;
  }

  return counted === 0 ? undefined : `${subcommand.slice(0, lastKeptEnd)}${WORD_BOUNDARY_SUFFIX}`;
}

/**
 * Capture side: derive one literal-prefix specifier per subcommand, deduped and capped at
 * {@link MAX_DERIVED_RULES}. A subcommand with no non-flag token contributes nothing. User config is
 * the only auto-approve authority — there is no read-only skip.
 */
export function deriveCommandRules(command: string, shell: ShellDialect, depth = DEFAULT_PREFIX_DEPTH): string[] {
  const syntax = SHELL_SYNTAX[shell];
  const specifiers: string[] = [];

  for (const subcommand of splitSubcommands(command, shell)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    const specifier = derivePrefixSpecifier(subcommand, syntax, depth);
    if (specifier !== undefined && !specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Diff-aware capture: split once, then derive one specifier per subcommand not already covered by
 * `existingSpecifiers` (matched via {@link matchesSpecifier}), deduped and capped at
 * {@link MAX_DERIVED_RULES}. Shares {@link derivePrefixSpecifier} with {@link deriveCommandRules}
 * rather than re-invoking the whole-command capture, which would decompose a subcommand twice.
 */
export function deriveNewCommandRules(
  command: string,
  existingSpecifiers: string[],
  shell: ShellDialect,
  depth = DEFAULT_PREFIX_DEPTH
): string[] {
  const syntax = SHELL_SYNTAX[shell];
  const specifiers: string[] = [];

  for (const subcommand of splitSubcommands(command, shell)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    if (existingSpecifiers.some((specifier) => matchesSpecifier(subcommand, specifier))) {
      continue;
    }

    const specifier = derivePrefixSpecifier(subcommand, syntax, depth);
    if (specifier !== undefined && !specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Match side: fails closed. Each literal subcommand is matched against the specifiers via
 * {@link matchesSpecifier}. `ALL` (approve) requires every subcommand to match; `ANY` (deny) fires
 * when a single subcommand matches. Empty/unparseable input yields `false` in both modes.
 */
export function matchesCommandRules(
  command: string,
  specifiers: string[],
  shell: ShellDialect,
  mode: SubcommandMatchMode = SUBCOMMAND_MATCH_MODE.ALL
): boolean {
  const subcommands = splitSubcommands(command, shell);
  if (subcommands.length === 0) {
    return false;
  }

  const subcommandMatches = (subcommand: string): boolean =>
    specifiers.some((specifier) => matchesSpecifier(subcommand, specifier));

  return mode === SUBCOMMAND_MATCH_MODE.ANY
    ? subcommands.some(subcommandMatches)
    : subcommands.every(subcommandMatches);
}
