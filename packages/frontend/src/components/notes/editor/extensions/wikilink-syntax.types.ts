import type { TextRange } from "./table-syntax.types.js";

/** A parsed `[[target]]`; positions are document offsets */
export interface WikilinkSyntax extends TextRange {
  openMark: TextRange;
  closeMark: TextRange;
  /** The raw target between the marks, escapes included */
  targetRange: TextRange;
  /** Each escaping backslash inside the target, hidden like the marks */
  escapePositions: number[];
  /** The unescaped, trimmed target that resolves to a note */
  target: string;
}

/** How a wikilink's text is marked up, shared by the editor line and table cells */
export interface WikilinkMarkSpec {
  className: string;
  attributes: Record<string, string>;
}
