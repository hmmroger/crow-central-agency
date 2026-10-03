import { MapMode, StateEffect, StateField, type EditorState, type Transaction } from "@codemirror/state";
import type { ActiveTableCell, TableCellPosition } from "./table-cell-state.types.js";

/** Positions refer to the document after the transaction's changes */
export const setActiveTableCell = StateEffect.define<TableCellPosition | undefined>();

export const setTableCellDraft = StateEffect.define<string>();

/** A cell stays active while its table's first line survives the change. */
function mapActiveTableCell(cell: ActiveTableCell, transaction: Transaction): ActiveTableCell | undefined {
  const tableFrom = transaction.changes.mapPos(cell.tableFrom, -1, MapMode.TrackDel);

  return tableFrom === null ? undefined : { ...cell, tableFrom };
}

function updateActiveTableCell(
  previous: ActiveTableCell | undefined,
  transaction: Transaction
): ActiveTableCell | undefined {
  let cell = previous && transaction.docChanged ? mapActiveTableCell(previous, transaction) : previous;

  for (const effect of transaction.effects) {
    if (effect.is(setActiveTableCell)) {
      cell = effect.value;
    } else if (effect.is(setTableCellDraft) && cell) {
      cell = { ...cell, draft: effect.value };
    }
  }

  return cell;
}

/** The table cell being edited in place, if any. */
export const activeTableCellField = StateField.define<ActiveTableCell | undefined>({
  create: () => undefined,
  update: updateActiveTableCell,
});

export function getActiveTableCell(state: EditorState): ActiveTableCell | undefined {
  return state.field(activeTableCellField, false);
}

export function isTableCellActive(state: EditorState): boolean {
  return getActiveTableCell(state) !== undefined;
}
