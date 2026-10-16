/** Common HTML5 named character references, translated without consulting the browser decoder. */
const COMMON_ENTITY_NAMES: ReadonlySet<string> = new Set([
  "lt",
  "gt",
  "amp",
  "quot",
  "apos",
  "nbsp",
  "copy",
  "reg",
  "trade",
  "hellip",
  "mdash",
  "ndash",
  "lsquo",
  "rsquo",
  "ldquo",
  "rdquo",
  "laquo",
  "raquo",
  "bull",
  "middot",
  "times",
  "divide",
  "plusmn",
  "deg",
  "le",
  "ge",
  "ne",
  "larr",
  "rarr",
  "uarr",
  "darr",
  "harr",
  "lArr",
  "rArr",
  "hArr",
  "hearts",
  "check",
  "cross",
]);
const HTML_CHARACTER_REFERENCE = /&(?:([A-Za-z][A-Za-z0-9]*)|#([0-9]+)|#[xX]([0-9A-Fa-f]+));/g;
const MAX_CODE_POINT = 0x10ffff;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
/** A complete named reference decodes to one or two code points; anything longer is a legacy prefix plus text. */
const MAX_ENTITY_CODE_POINTS = 2;

function toMermaidCodePoint(match: string, digits: string, radix: number): string {
  const codePoint = parseInt(digits, radix);
  return codePoint <= MAX_CODE_POINT ? `#${codePoint};` : match;
}

/**
 * Rewrites HTML character references into mermaid's entity syntax (`&lt;` → `#lt;`, `&#x3C;` → `#60;`),
 * since mermaid treats the `;` of an HTML reference as a statement terminator.
 * Unknown names (e.g. flowchart `A&B;`) and out-of-range code points are left untouched.
 */
export function translateHtmlEntities(source: string): string {
  let decoder: HTMLTextAreaElement | undefined;

  return source.replace(
    HTML_CHARACTER_REFERENCE,
    (match, name: string | undefined, decimal: string | undefined, hex: string | undefined) => {
      if (name !== undefined) {
        if (COMMON_ENTITY_NAMES.has(name)) {
          return `#${name};`;
        }

        decoder ??= document.createElement("textarea");
        decoder.innerHTML = match;
        const decoded = decoder.value;
        return decoded !== match && Array.from(decoded).length <= MAX_ENTITY_CODE_POINTS ? `#${name};` : match;
      }

      if (decimal !== undefined) {
        return toMermaidCodePoint(match, decimal, DECIMAL_RADIX);
      }

      if (hex !== undefined) {
        return toMermaidCodePoint(match, hex, HEX_RADIX);
      }

      return match;
    }
  );
}
