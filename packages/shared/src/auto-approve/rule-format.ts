import type { ParsedRule } from "./auto-approve-rule.types.js";

/** Glob wildcard used in rule specifiers. */
export const GLOB_STAR = "*";

/**
 * A space before a trailing `*` enforces a word boundary: `ls *` matches `ls` and `ls -la`,
 * but never `lsof`.
 */
export const WORD_BOUNDARY_SUFFIX = " *";

/** Claude's `:*` prefix suffix, treated as equivalent to a trailing ` *`. */
export const PREFIX_STAR_SUFFIX = ":*";

const RULE_PATTERN = /^([^()]+)(?:\((.*)\))?$/;
const REGEXP_SPECIAL_CHARS = /[.+?^${}()|[\]\\]/g;

/**
 * Parse a rule string into its tool + optional specifier. Fails closed: any malformed rule
 * (unbalanced parentheses, empty tool, stray `(` in the tool name) yields `undefined`.
 */
export function parseRule(rule: string): ParsedRule | undefined {
  const trimmed = rule.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = RULE_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const tool = match[1];
  const specifier = match[2];
  if (tool.length === 0) {
    return undefined;
  }

  return specifier === undefined ? { tool } : { tool, specifier };
}

/** Parse a list of rule strings, discarding any that fail to parse. */
export function parseRules(rules: string[]): ParsedRule[] {
  const parsed: ParsedRule[] = [];
  for (const rule of rules) {
    const result = parseRule(rule);
    if (result !== undefined) {
      parsed.push(result);
    }
  }

  return parsed;
}

/** Format a parsed rule back into its canonical string form. */
export function formatRule(rule: ParsedRule): string {
  return rule.specifier === undefined ? rule.tool : `${rule.tool}(${rule.specifier})`;
}

/** Normalize Claude's `:*` prefix suffix into the equivalent word-boundary ` *` form. */
function normalizeSpecifier(specifier: string): string {
  if (specifier.endsWith(PREFIX_STAR_SUFFIX)) {
    return `${specifier.slice(0, -PREFIX_STAR_SUFFIX.length)}${WORD_BOUNDARY_SUFFIX}`;
  }

  return specifier;
}

function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split(GLOB_STAR)
    .map((segment) => segment.replace(REGEXP_SPECIAL_CHARS, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`);
}

/**
 * Whether a single command/value matches a rule specifier under glob semantics. A specifier
 * ending in a word-boundary ` *` (or `:*`) matches the exact prefix or the prefix followed by a
 * space; any other `*` is a general wildcard. No wildcard means an exact match.
 */
export function matchesSpecifier(value: string, specifier: string): boolean {
  const normalized = normalizeSpecifier(specifier);

  if (normalized.endsWith(WORD_BOUNDARY_SUFFIX)) {
    const base = normalized.slice(0, -WORD_BOUNDARY_SUFFIX.length);
    if (!base.includes(GLOB_STAR)) {
      return value === base || value.startsWith(`${base} `);
    }
  }

  if (normalized.includes(GLOB_STAR)) {
    return globToRegExp(normalized).test(value);
  }

  return value === normalized;
}
