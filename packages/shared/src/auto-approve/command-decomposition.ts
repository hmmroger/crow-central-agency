import { matchesSpecifier, WORD_BOUNDARY_SUFFIX } from "./rule-format.js";

/** Prefix depth for derived rules (first N tokens of a subcommand). */
export const DEFAULT_PREFIX_DEPTH = 2;

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

/**
 * Read-only shell builtins that run with no prompt. `cd` and `git` are handled separately
 * (in-cwd `cd` only; read-only `git` subcommands only).
 */
export const READ_ONLY_BUILTINS = new Set([
  "ls",
  "cat",
  "echo",
  "pwd",
  "head",
  "tail",
  "grep",
  "find",
  "wc",
  "which",
  "diff",
  "stat",
  "du",
]);

const CD_COMMAND = "cd";
const IN_CWD_CD_ARGS = new Set([".", "./"]);
const GIT_COMMAND = "git";
const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "log", "diff", "show"]);

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
      if (next !== undefined && next.startsWith("-")) {
        break;
      }

      remaining = remaining.slice(1);
      continue;
    }

    if (!PROCESS_WRAPPERS.has(head)) {
      break;
    }

    remaining = remaining.slice(1);
    while (remaining.length > 0 && remaining[0].startsWith("-")) {
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

/** Whether a normalized subcommand is a read-only builtin, in-cwd `cd`, or read-only `git`. */
export function isReadOnlyCommand(subcommand: string): boolean {
  const tokens = tokenize(subcommand);
  const head = tokens[0];
  if (head === undefined) {
    return false;
  }

  if (head === CD_COMMAND) {
    const target = tokens[1];
    return target === undefined || IN_CWD_CD_ARGS.has(target);
  }

  if (head === GIT_COMMAND) {
    const gitSubcommand = tokens[1];
    return gitSubcommand !== undefined && READ_ONLY_GIT_SUBCOMMANDS.has(gitSubcommand);
  }

  return READ_ONLY_BUILTINS.has(head);
}

/**
 * Capture side: derive one prefix-`depth` specifier per non-read-only subcommand (in-cwd `cd` and
 * read-only builtins contribute nothing), deduped and capped at {@link MAX_DERIVED_RULES}.
 */
export function deriveRules(command: string, depth = DEFAULT_PREFIX_DEPTH): string[] {
  const specifiers: string[] = [];

  for (const subcommand of splitSubcommands(command)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    if (isReadOnlyCommand(subcommand)) {
      continue;
    }

    const tokens = tokenize(subcommand);
    if (tokens.length === 0) {
      continue;
    }

    const prefix = tokens.slice(0, depth).join(" ");
    const specifier = `${prefix}${WORD_BOUNDARY_SUFFIX}`;
    if (!specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Match side: fails closed. Every subcommand must be a read-only builtin or match one of the
 * specifiers. Empty/unparseable input yields `false`.
 */
export function matchesRules(command: string, specifiers: string[]): boolean {
  const subcommands = splitSubcommands(command);
  if (subcommands.length === 0) {
    return false;
  }

  for (const subcommand of subcommands) {
    if (isReadOnlyCommand(subcommand)) {
      continue;
    }

    if (!specifiers.some((specifier) => matchesSpecifier(subcommand, specifier))) {
      return false;
    }
  }

  return true;
}
