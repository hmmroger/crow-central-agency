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
 * Shell separators that decompose a compound command. Two-character separators are matched before
 * the single-character ones so `&&`/`||`/`|&` win over `&`/`|`.
 */
export const TWO_CHAR_SEPARATORS = ["&&", "||", "|&"] as const;
export const SINGLE_CHAR_SEPARATORS = [";", "|", "&", "\n", "\r"] as const;

/**
 * Process wrappers stripped from the front of a subcommand before matching. `timeout`/`nice` also
 * consume a leading numeric argument (duration / priority).
 */
export const PROCESS_WRAPPERS = new Set(["timeout", "time", "nice", "nohup", "stdbuf"]);
const WRAPPERS_WITH_NUMERIC_ARG = new Set(["timeout", "nice"]);
const XARGS_WRAPPER = "xargs";

const OPTION_PREFIX = "-";

const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const REDIRECT_CHAR = ">";

/** Split a command string into whitespace-delimited tokens, respecting single/double quotes. */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let hasToken = false;
  let quote: string | undefined;

  for (const char of command) {
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }

      continue;
    }

    if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === " " || char === "\t") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }

      continue;
    }

    current += char;
    hasToken = true;
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}

/** Return the shell separator starting at `index`, or `undefined` if none. */
function separatorAt(command: string, index: number): string | undefined {
  const twoChar = command.slice(index, index + 2);
  for (const separator of TWO_CHAR_SEPARATORS) {
    if (twoChar === separator) {
      return separator;
    }
  }

  const char = command[index];
  if (char === "&") {
    // Guard shell redirects (`2>&1`, `&>file`) from being read as a background separator.
    if (command[index - 1] === REDIRECT_CHAR || command[index + 1] === REDIRECT_CHAR) {
      return undefined;
    }
  }

  for (const separator of SINGLE_CHAR_SEPARATORS) {
    if (char === separator) {
      return separator;
    }
  }

  return undefined;
}

/** Strip leading process wrappers (and their option/numeric args) from a token list. */
function stripWrappers(tokens: string[]): string[] {
  let remaining = tokens;

  while (remaining.length > 0) {
    const head = remaining[0];

    if (head === XARGS_WRAPPER) {
      // Only bare `xargs` (no flags) is transparent; flagged xargs stays and simply won't match.
      const next = remaining[1];
      if (next !== undefined && next.startsWith(OPTION_PREFIX)) {
        break;
      }

      remaining = remaining.slice(1);
      continue;
    }

    if (!PROCESS_WRAPPERS.has(head)) {
      break;
    }

    remaining = remaining.slice(1);
    while (remaining.length > 0 && remaining[0].startsWith(OPTION_PREFIX)) {
      remaining = remaining.slice(1);
    }

    if (WRAPPERS_WITH_NUMERIC_ARG.has(head) && remaining.length > 0 && /^[0-9]/.test(remaining[0])) {
      remaining = remaining.slice(1);
    }
  }

  return remaining;
}

/**
 * Split a compound command into its normalized subcommands. Splits on shell separators outside
 * quotes, strips process wrappers, and drops empty segments. The returned strings are re-joined
 * from parsed tokens (quotes removed, whitespace collapsed) for stable matching.
 */
export function splitSubcommands(command: string): string[] {
  const rawSegments: string[] = [];
  let current = "";
  let quote: string | undefined;
  let index = 0;

  while (index < command.length) {
    const char = command[index];

    if (quote !== undefined) {
      current += char;
      if (char === quote) {
        quote = undefined;
      }

      index += 1;
      continue;
    }

    if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
      quote = char;
      current += char;
      index += 1;
      continue;
    }

    const separator = separatorAt(command, index);
    if (separator !== undefined) {
      rawSegments.push(current);
      current = "";
      index += separator.length;
      continue;
    }

    current += char;
    index += 1;
  }

  rawSegments.push(current);

  const subcommands: string[] = [];
  for (const segment of rawSegments) {
    const tokens = stripWrappers(tokenize(segment));
    if (tokens.length > 0) {
      subcommands.push(tokens.join(" "));
    }
  }

  return subcommands;
}

function derivePrefixTokens(tokens: string[], depth: number): string[] | undefined {
  const prefix: string[] = [];
  let counted = 0;
  let index = 0;

  while (index < tokens.length && counted < depth) {
    const token = tokens[index];

    if (token.startsWith(OPTION_PREFIX)) {
      prefix.push(token);
      index += 1;
      if (index < tokens.length && !tokens[index].startsWith(OPTION_PREFIX)) {
        prefix.push(tokens[index]);
        index += 1;
      }

      continue;
    }

    prefix.push(token);
    counted += 1;
    index += 1;
  }

  return counted === 0 ? undefined : prefix;
}

/**
 * Capture side: derive one flag-aware prefix specifier per subcommand, deduped and capped at
 * {@link MAX_DERIVED_RULES}. A subcommand with no non-flag token (e.g. a lone `--flag`) contributes
 * nothing. User config is the only auto-approve authority — there is no read-only skip.
 */
export function deriveRules(command: string, depth = DEFAULT_PREFIX_DEPTH): string[] {
  const specifiers: string[] = [];

  for (const subcommand of splitSubcommands(command)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    const prefixTokens = derivePrefixTokens(tokenize(subcommand), depth);
    if (prefixTokens === undefined) {
      continue;
    }

    const specifier = `${prefixTokens.join(" ")}${WORD_BOUNDARY_SUFFIX}`;
    if (!specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Diff-aware capture: derive prefix specifiers only for subcommands not already covered by
 * `existingSpecifiers`, composing the untouched {@link deriveRules} (capture) and
 * {@link matchesSpecifier} (match) primitives. A subcommand matched by an existing specifier is
 * skipped; the rest derive one specifier each, deduped and capped at {@link MAX_DERIVED_RULES}.
 */
export function deriveNewRules(command: string, existingSpecifiers: string[], depth = DEFAULT_PREFIX_DEPTH): string[] {
  const specifiers: string[] = [];

  for (const subcommand of splitSubcommands(command)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    if (existingSpecifiers.some((specifier) => matchesSpecifier(subcommand, specifier))) {
      continue;
    }

    for (const specifier of deriveRules(subcommand, depth)) {
      if (!specifiers.includes(specifier)) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers.slice(0, MAX_DERIVED_RULES);
}

/**
 * Match side: fails closed. Each raw subcommand is matched against the specifiers via literal-prefix
 * `matchesSpecifier` (no flag logic on this side). `ALL` (approve) requires every subcommand to
 * match; `ANY` (deny) fires when a single subcommand matches. Empty/unparseable input yields `false`
 * in both modes.
 */
export function matchesRules(
  command: string,
  specifiers: string[],
  mode: SubcommandMatchMode = SUBCOMMAND_MATCH_MODE.ALL
): boolean {
  const subcommands = splitSubcommands(command);
  if (subcommands.length === 0) {
    return false;
  }

  const subcommandMatches = (subcommand: string): boolean =>
    specifiers.some((specifier) => matchesSpecifier(subcommand, specifier));

  return mode === SUBCOMMAND_MATCH_MODE.ANY
    ? subcommands.some(subcommandMatches)
    : subcommands.every(subcommandMatches);
}
