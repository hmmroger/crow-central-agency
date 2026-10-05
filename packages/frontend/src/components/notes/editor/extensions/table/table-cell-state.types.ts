import type { TableCellIndex } from "./table-syntax.types.js";

export interface TableCellPosition extends TableCellIndex {
  /** Start of the table's header line */
  tableFrom: number;
}

export interface ActiveTableCell extends TableCellPosition {
  /** The cell's edited markdown, not yet written to the document */
  draft?: string;
}
