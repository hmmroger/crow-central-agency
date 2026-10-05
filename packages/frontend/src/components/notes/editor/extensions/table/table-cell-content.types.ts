import type { ImageWidget } from "../image-widget.js";
import type { DelimitedSyntaxNodeName } from "../markdown-syntax.types.js";
import type { TextRange } from "./table-syntax.types.js";

export const TABLE_SPAN_KIND = {
  /** Syntax hidden while the cell is not being edited */
  MARK: "mark",
  LINE_BREAK: "lineBreak",
  FORMAT: "format",
  LINK: "link",
  /** The target of a `[[target]]` */
  WIKILINK: "wikilink",
  /** Drawn as the image while the cell is not being edited */
  IMAGE: "image",
} as const;

/** Offsets are relative to the start of the cell's content */
export type TableCellSpan =
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.MARK })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.LINE_BREAK })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.FORMAT; format: DelimitedSyntaxNodeName })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.LINK; url: string })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.WIKILINK; target: string })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.IMAGE; widget: ImageWidget });
