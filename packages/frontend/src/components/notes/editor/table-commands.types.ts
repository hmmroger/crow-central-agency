import type { ChangeSpec, EditorSelection } from "@codemirror/state";
import type { ActiveTableCell, TableCellPosition } from "./extensions/table/table-cell-state.types.js";
import type { ParsedTable } from "./extensions/table/table-syntax.types.js";

export const TABLE_EXIT = {
  BEFORE: "before",
  AFTER: "after",
} as const;

export type TableExit = (typeof TABLE_EXIT)[keyof typeof TABLE_EXIT];

export interface ActiveTable {
  table: ParsedTable;
  cell: ActiveTableCell;
}

export interface TableCursor {
  position: number;
  assoc: -1 | 1;
}

/** One undoable table edit; positions refer to the document before it */
export interface TableEdit {
  changes: ChangeSpec[];
  nextCell?: TableCellPosition;
  /** A cursor placed on its own side of the changes; takes precedence over `selection` */
  cursor?: TableCursor;
  /** A selection mapped through the changes */
  selection?: EditorSelection;
}
