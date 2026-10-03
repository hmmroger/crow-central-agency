import type { ImageSyntax } from "./image-syntax.types.js";
import type { DelimitedSyntaxNodeName } from "./markdown-syntax.types.js";

export const TABLE_ALIGNMENT = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
} as const;

export type TableAlignment = (typeof TABLE_ALIGNMENT)[keyof typeof TABLE_ALIGNMENT];

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

export interface TextRange {
  from: number;
  to: number;
}

/** Offsets are relative to the start of the cell's content */
export type TableCellSpan =
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.MARK })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.LINE_BREAK })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.FORMAT; format: DelimitedSyntaxNodeName })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.LINK; url: string })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.WIKILINK; target: string })
  | (TextRange & { kind: typeof TABLE_SPAN_KIND.IMAGE; image: ImageSyntax });

/** An empty cell is a collapsed range where typed text belongs */
export interface TableCell extends TextRange {
  content: string;
  spans: TableCellSpan[];
}

export interface TableDelimiterCell extends TextRange {
  alignment?: TableAlignment;
}

export interface TableLine<Cell extends TextRange> extends TextRange {
  cells: Cell[];
  hasTrailingPipe: boolean;
}

export type TableRow = TableLine<TableCell>;

/** `from` is the start of the header's line, so the table covers whole lines */
export interface ParsedTable extends TextRange {
  header: TableRow;
  delimiter: TableLine<TableDelimiterCell>;
  /** Body rows; row index 0 is the header, so body row `n` is `rows[n - 1]` */
  rows: TableRow[];
}
