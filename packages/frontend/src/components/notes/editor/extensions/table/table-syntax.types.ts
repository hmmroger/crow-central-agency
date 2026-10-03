export const TABLE_ALIGNMENT = {
  LEFT: "left",
  CENTER: "center",
  RIGHT: "right",
} as const;

export type TableAlignment = (typeof TABLE_ALIGNMENT)[keyof typeof TABLE_ALIGNMENT];

export interface TextRange {
  from: number;
  to: number;
}

/** An empty cell is a collapsed range where typed text belongs */
export interface TableCell extends TextRange {
  content: string;
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
