import { matchesSpecifier, WORD_BOUNDARY_SUFFIX } from "@crow-central-agency/shared";
import type { ShellSyntax } from "./shell-grammar.types.js";
import {
  BLOCK_CLOSE,
  BLOCK_OPEN,
  DOLLAR,
  PAREN_CLOSE,
  PAREN_OPEN,
  SHELL,
  SHELL_SYNTAX,
  SUBSTITUTION_MARKER,
  findBalancedEnd,
  skipInertRegion,
  splitSubcommandsBySyntax,
  substitutionOpenParen,
  tokenSpans,
  type ShellDialect,
} from "./shell-grammar.js";

export { SHELL };
export type { ShellDialect };

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

const OPTION_PREFIX = "-";
const ASSIGNMENT_OPERATORS = ["=", "+="] as const;
/** A leading Bash `NAME=value` assignment token: an identifier immediately followed by `=`. */
const BASH_ASSIGNMENT_TOKEN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Split a compound command into its top-level subcommands, preserving each as a literal slice of
 * the original (outer whitespace trimmed, empties dropped). Boundaries respect the shell's quote
 * and escape grammar, so separators inside quotes or escaped are not split on.
 */
export function splitSubcommands(command: string, shell: ShellDialect): string[] {
  return splitSubcommandsBySyntax(command, SHELL_SYNTAX[shell]);
}

/**
 * Strip leading assignment prefixes from a subcommand slice, returning the remaining suffix. An
 * assignment target can't run anything, so keeping it would key the derived rule on a variable name.
 * A PowerShell target-plus-operator with no right-hand token (`$x =`) strips to empty: its RHS is a
 * script block already recursed as its own leaf, so the bare assignment must not become a junk rule.
 */
function stripAssignmentPrefix(text: string, syntax: ShellSyntax): string {
  if (syntax.bashAssignmentPrefix) {
    let remaining = text;
    while (true) {
      const spans = tokenSpans(remaining, syntax);
      if (spans.length === 0) {
        return remaining;
      }

      const firstToken = remaining.slice(spans[0].start, spans[0].end);
      if (!BASH_ASSIGNMENT_TOKEN.test(firstToken)) {
        return remaining;
      }

      remaining = remaining.slice(spans[0].end).trimStart();
    }
  }

  if (syntax.variableAssignmentPrefix) {
    const spans = tokenSpans(text, syntax);
    if (spans.length < 2) {
      return text;
    }

    const target = text.slice(spans[0].start, spans[0].end);
    const operator = text.slice(spans[1].start, spans[1].end);
    const isAssignment =
      target.startsWith(DOLLAR) && (ASSIGNMENT_OPERATORS as readonly string[]).includes(operator);
    if (!isAssignment) {
      return text;
    }

    return spans.length >= 3 ? text.slice(spans[2].start) : "";
  }

  return text;
}

/**
 * Decompose one already-split subcommand into the commands actually being run, appending each as a
 * literal slice to `leaves`. The prefix up to the first script block or command substitution is one
 * leaf; a block's or substitution's contents recurse as their own command list. An unresolvable
 * boundary is left literal in the enclosing leaf. If nothing is emitted (e.g. all assignments), the
 * whole subcommand is kept so every position carries a match obligation.
 */
function collectSubcommandLeaves(subcommand: string, syntax: ShellSyntax, leaves: string[]): void {
  const startCount = leaves.length;
  let prefixStart = 0;
  let index = 0;

  const emitPrefix = (end: number): void => {
    const slice = subcommand.slice(prefixStart, end).trim();
    if (slice.length === 0) {
      return;
    }

    const stripped = stripAssignmentPrefix(slice, syntax);
    if (stripped.length > 0) {
      leaves.push(stripped);
    }
  };

  while (index < subcommand.length) {
    const inertEnd = skipInertRegion(subcommand, index, syntax);
    if (inertEnd !== undefined) {
      index = inertEnd;
      continue;
    }

    const char = subcommand[index];

    if (syntax.scriptBlock && char === BLOCK_OPEN) {
      const end = findBalancedEnd(subcommand, index, BLOCK_OPEN, BLOCK_CLOSE, syntax);
      if (end === undefined) {
        index += 1;
        continue;
      }

      emitPrefix(index);
      collectLeaves(subcommand.slice(index + 1, end - 1), syntax, leaves);
      prefixStart = end;
      index = end;
      continue;
    }

    const parenIndex = substitutionOpenParen(subcommand, index, syntax);
    if (parenIndex !== undefined) {
      const end = findBalancedEnd(subcommand, parenIndex, PAREN_OPEN, PAREN_CLOSE, syntax);
      if (end === undefined) {
        index = parenIndex + 1;
        continue;
      }

      emitPrefix(index);
      collectLeaves(subcommand.slice(parenIndex + 1, end - 1), syntax, leaves);
      prefixStart = end;
      index = end;
      continue;
    }

    if (syntax.arithmetic && char === SUBSTITUTION_MARKER && subcommand[index + 1] === PAREN_OPEN) {
      index += 2;
      continue;
    }

    index += 1;
  }

  emitPrefix(subcommand.length);

  if (leaves.length === startCount) {
    const whole = subcommand.trim();
    if (whole.length > 0) {
      leaves.push(whole);
    }
  }
}

function collectLeaves(command: string, syntax: ShellSyntax, leaves: string[]): void {
  for (const subcommand of splitSubcommandsBySyntax(command, syntax)) {
    collectSubcommandLeaves(subcommand, syntax, leaves);
  }
}

/**
 * Decompose a command into the commands actually being run, as literal slices of the original: split
 * top-level subcommands ({@link splitSubcommands}), then recurse into each subcommand's script blocks
 * and command substitutions, skipping assignment prefixes. Both derivation and matching consume this,
 * so they cannot disagree on where the commands are. Never empty for a non-empty command.
 */
export function splitCommandPositions(command: string, shell: ShellDialect): string[] {
  const leaves: string[] = [];
  collectLeaves(command, SHELL_SYNTAX[shell], leaves);
  return leaves;
}

/**
 * Derive one flag-aware prefix specifier for a single already-decomposed leaf: keep the first
 * {@link DEFAULT_PREFIX_DEPTH} non-flag tokens (a `-`/`--` flag and its following value are kept but
 * not counted), then take that literal prefix of the source plus {@link WORD_BOUNDARY_SUFFIX}.
 *
 * Stops at the first `$`-bearing non-flag token: a variable's value decides what runs, so its name is
 * noise (`Remove-Item $file` → `Remove-Item *`). But if the leaf's first token itself bears a `$`, the
 * whole leaf is variable-driven, so fall back to normal derivation (`$_.Status -eq 'Running' *`);
 * stopping there would yield no rule, and a leaf with no rule can never be matched.
 *
 * `undefined` when there is no non-flag token (e.g. a lone `--flag`). Never re-splits the leaf.
 */
function derivePrefixSpecifier(subcommand: string, syntax: ShellSyntax, depth: number): string | undefined {
  const spans = tokenSpans(subcommand, syntax);
  const firstTokenBearsDollar =
    spans.length > 0 && subcommand.slice(spans[0].start, spans[0].end).includes(DOLLAR);
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

    if (!firstTokenBearsDollar && counted > 0 && text.includes(DOLLAR)) {
      break;
    }

    lastKeptEnd = spans[index].end;
    counted += 1;
    index += 1;
  }

  return counted === 0 ? undefined : `${subcommand.slice(0, lastKeptEnd)}${WORD_BOUNDARY_SUFFIX}`;
}

/**
 * Capture side: derive one literal-prefix specifier per leaf ({@link splitCommandPositions}), deduped
 * and capped at {@link MAX_DERIVED_RULES}. A leaf with no non-flag token contributes nothing. User
 * config is the only auto-approve authority — there is no read-only skip.
 */
export function deriveCommandRules(command: string, shell: ShellDialect, depth = DEFAULT_PREFIX_DEPTH): string[] {
  const syntax = SHELL_SYNTAX[shell];
  const specifiers: string[] = [];

  for (const leaf of splitCommandPositions(command, shell)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    const specifier = derivePrefixSpecifier(leaf, syntax, depth);
    if (specifier !== undefined && !specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Diff-aware capture: decompose once ({@link splitCommandPositions}), then derive one specifier per
 * leaf not already covered by `existingSpecifiers` (matched via {@link matchesSpecifier}), deduped and
 * capped at {@link MAX_DERIVED_RULES}. Shares {@link derivePrefixSpecifier} with
 * {@link deriveCommandRules} so a leaf is never decomposed twice.
 */
export function deriveNewCommandRules(
  command: string,
  existingSpecifiers: string[],
  shell: ShellDialect,
  depth = DEFAULT_PREFIX_DEPTH
): string[] {
  const syntax = SHELL_SYNTAX[shell];
  const specifiers: string[] = [];

  for (const leaf of splitCommandPositions(command, shell)) {
    if (specifiers.length >= MAX_DERIVED_RULES) {
      break;
    }

    if (existingSpecifiers.some((specifier) => matchesSpecifier(leaf, specifier))) {
      continue;
    }

    const specifier = derivePrefixSpecifier(leaf, syntax, depth);
    if (specifier !== undefined && !specifiers.includes(specifier)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/**
 * Match side: fails closed. Each literal leaf ({@link splitCommandPositions}) is matched against the
 * specifiers via {@link matchesSpecifier}. `ALL` (approve) requires every leaf to match; `ANY` (deny)
 * fires when a single leaf matches. Empty/unparseable input yields `false` in both modes.
 */
export function matchesCommandRules(
  command: string,
  specifiers: string[],
  shell: ShellDialect,
  mode: SubcommandMatchMode = SUBCOMMAND_MATCH_MODE.ALL
): boolean {
  const leaves = splitCommandPositions(command, shell);
  if (leaves.length === 0) {
    return false;
  }

  const leafMatches = (leaf: string): boolean =>
    specifiers.some((specifier) => matchesSpecifier(leaf, specifier));

  return mode === SUBCOMMAND_MATCH_MODE.ANY ? leaves.some(leafMatches) : leaves.every(leafMatches);
}
