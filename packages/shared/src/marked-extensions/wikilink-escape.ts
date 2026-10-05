/** Regex character-class body of what a backslash escapes: `[`, `]` and `\`. Nothing else is escapable. */
const ESCAPABLE_CHARS_SOURCE = String.raw`[\]\\`;
const ESCAPABLE_CLASS_SOURCE = `[${ESCAPABLE_CHARS_SOURCE}]`;
const ESCAPE_SOURCE = String.raw`\\${ESCAPABLE_CLASS_SOURCE}`;

/**
 * Regex source for one character of a target: an escape, anything but a bracket, backslash or line
 * break, or a backslash that escapes nothing and so is literal.
 */
export const WIKILINK_TARGET_CHAR_SOURCE = String.raw`(?:${ESCAPE_SOURCE}|[^${ESCAPABLE_CHARS_SOURCE}\n]|\\(?!${ESCAPABLE_CLASS_SOURCE}))`;

const ESCAPABLE_CHAR_PATTERN = new RegExp(`^${ESCAPABLE_CLASS_SOURCE}$`);
const ESCAPABLE_PATTERN = new RegExp(ESCAPABLE_CLASS_SOURCE, "g");
const ESCAPE_PATTERN = new RegExp(ESCAPE_SOURCE, "g");
const ESCAPED_PATTERN = new RegExp(String.raw`\\(${ESCAPABLE_CLASS_SOURCE})`, "g");

/** Whether a backslash before `char` is an escape rather than a literal backslash. */
export function isEscapableWikilinkChar(char: string): boolean {
  return ESCAPABLE_CHAR_PATTERN.test(char);
}

/** Offsets in `rawTarget` of each backslash that escapes the character after it. */
export function findWikilinkEscapeOffsets(rawTarget: string): number[] {
  return Array.from(rawTarget.matchAll(ESCAPE_PATTERN), (match) => match.index);
}

/** Writes `target` so it survives inside `[[…]]`: brackets and backslashes are backslash-escaped. */
export function escapeWikilinkTarget(target: string): string {
  return target.replace(ESCAPABLE_PATTERN, "\\$&");
}

/** The target a `[[…]]` names, with its `\[`, `\]` and `\\` escapes undone. */
export function unescapeWikilinkTarget(rawTarget: string): string {
  return rawTarget.replace(ESCAPED_PATTERN, "$1");
}
