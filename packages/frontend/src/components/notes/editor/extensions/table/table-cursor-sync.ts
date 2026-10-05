import {
  EditorSelection,
  EditorState,
  type Extension,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import { buildMoveTableCellSpec, findActiveTable, findTableAround } from "../../table-commands.js";
import { getActiveTableCell, setActiveTableCell } from "./table-cell-state.js";
import type { TableCellPosition } from "./table-cell-state.types.js";
import { findTableCellAt, getTableCell } from "./table-syntax.js";
import { focusActiveTableCell } from "./table-widget.js";
import { CARET_EDGE } from "./table-widget.types.js";

function hasActiveCellEffect(transaction: Transaction): boolean {
  return transaction.effects.some((effect) => effect.is(setActiveTableCell));
}

/** A cell made active by a command takes the document cursor as a selection over its source. */
function selectActiveCell(transaction: Transaction): TransactionSpec | undefined {
  const active = findActiveTable(transaction.state);
  const cell = active && getTableCell(active.table, active.cell.row, active.cell.column);

  return cell && { selection: EditorSelection.range(cell.from, cell.to), sequential: true };
}

/**
 * A cursor moved by the editor activates the cell it lands in, its head on the side it came from; leaving
 * the active cell writes its pending edit.
 */
function followCursor(transaction: Transaction): TransactionSpec | undefined {
  const { startState, newSelection } = transaction;
  const { head, empty } = newSelection.main;
  const active = findActiveTable(startState);
  const activeCell = active && getTableCell(active.table, active.cell.row, active.cell.column);

  if (activeCell && activeCell.from <= head && head <= activeCell.to) {
    return undefined;
  }

  const isForward = head >= startState.selection.main.head;
  const table = empty ? findTableAround(startState, head) : undefined;
  const target = table && findTableCellAt(table, head, isForward);
  const targetCell = table && target && getTableCell(table, target.row, target.column);

  if (!table || !target || !targetCell) {
    return active ? buildMoveTableCellSpec(startState, undefined, newSelection) : undefined;
  }

  const selection = isForward
    ? EditorSelection.single(targetCell.to, targetCell.from)
    : EditorSelection.single(targetCell.from, targetCell.to);

  return buildMoveTableCellSpec(startState, { tableFrom: table.from, ...target }, selection);
}

/** A command that sets its own cursor keeps it; edits that move the cursor keep the active cell mapped as is. */
function getSyncSpec(transaction: Transaction): TransactionSpec | undefined {
  if (hasActiveCellEffect(transaction)) {
    return transaction.selection ? undefined : selectActiveCell(transaction);
  }

  if (transaction.selection && !transaction.docChanged) {
    return followCursor(transaction);
  }

  return undefined;
}

function syncTableCursor(transaction: Transaction): Transaction | readonly (Transaction | TransactionSpec)[] {
  const spec = getSyncSpec(transaction);

  return spec ? [transaction, spec] : transaction;
}

function isSameCellPosition(first: TableCellPosition | undefined, second: TableCellPosition | undefined): boolean {
  return first?.tableFrom === second?.tableFrom && first?.row === second?.row && first?.column === second?.column;
}

/** While the editor text has focus, an active cell takes it, with the caret at the selection's head. */
function focusActiveCell(update: ViewUpdate): void {
  const { view, state, startState } = update;
  const activeCell = getActiveTableCell(state);
  const isCellChanged = !isSameCellPosition(activeCell, getActiveTableCell(startState));

  if (!activeCell || !view.hasFocus || !(isCellChanged || update.focusChanged)) {
    return;
  }

  const { head, anchor } = state.selection.main;
  focusActiveTableCell(view, { edge: head < anchor ? CARET_EDGE.START : CARET_EDGE.END });
}

/** Keeps the active table cell and the document cursor on the same cell, whichever of them moves. */
export function tableCursorSync(): Extension {
  return [EditorState.transactionFilter.of(syncTableCursor), EditorView.updateListener.of(focusActiveCell)];
}
