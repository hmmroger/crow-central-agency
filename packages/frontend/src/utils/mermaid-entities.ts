const HTML_CHARACTER_REFERENCE = /&(?:([A-Za-z][A-Za-z0-9]*)|#([0-9]+)|#[xX]([0-9A-Fa-f]+));/g;

/**
 * Rewrites HTML character references into mermaid's entity syntax (`&lt;` → `#lt;`, `&#x3C;` → `#60;`),
 * since mermaid treats the `;` of an HTML reference as a statement terminator.
 */
export function translateHtmlEntities(source: string): string {
  return source.replace(
    HTML_CHARACTER_REFERENCE,
    (_match, name: string | undefined, decimal: string | undefined, hex: string | undefined) => {
      if (name !== undefined) {
        return `#${name};`;
      }

      if (decimal !== undefined) {
        return `#${decimal};`;
      }

      return `#${BigInt(`0x${hex}`).toString()};`;
    }
  );
}
