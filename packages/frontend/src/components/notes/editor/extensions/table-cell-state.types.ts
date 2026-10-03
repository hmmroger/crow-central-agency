export interface TableCellPosition {
  /** Start of the table's header line */
  tableFrom: number;
  /** 0 is the header row */
  row: number;
  column: number;
}

export interface ActiveTableCell extends TableCellPosition {
  /** The cell's edited markdown, not yet written to the document */
  draft?: string;
}
