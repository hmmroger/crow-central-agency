import type { DecorationSet } from "@codemirror/view";
import type { ActiveTableCell } from "./table-cell-state.types.js";
import type { ParsedTable } from "./table-syntax.types.js";

export interface TablePreviewState {
  tables: ParsedTable[];
  activeCell?: ActiveTableCell;
  decorations: DecorationSet;
}
