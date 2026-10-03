import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { moveTableCell } from "../table-commands.js";
import { activeTableCellField, getActiveTableCell } from "./table-cell-state.js";
import type { ActiveTableCell } from "./table-cell-state.types.js";
import type { TablePreviewState } from "./table-editor.types.js";
import { findTopLevelTables } from "./table-syntax.js";
import type { ParsedTable } from "./table-syntax.types.js";
import { TableWidget } from "./table-widget.js";

function isSameCellPosition(first: ActiveTableCell | undefined, second: ActiveTableCell | undefined): boolean {
  return first?.tableFrom === second?.tableFrom && first?.row === second?.row && first?.column === second?.column;
}

function buildPreviewState(tables: ParsedTable[], activeCell: ActiveTableCell | undefined): TablePreviewState {
  const decorations = Decoration.set(
    tables.map((table) =>
      Decoration.replace({
        widget: new TableWidget(table, activeCell?.tableFrom === table.from ? activeCell : undefined),
        block: true,
      }).range(table.from, table.to)
    )
  );

  return { tables, activeCell, decorations };
}

function createPreviewState(state: EditorState): TablePreviewState {
  return buildPreviewState(findTopLevelTables(state), getActiveTableCell(state));
}

/**
 * Tables do not depend on the selection: only a document or parse change re-parses them, and only a move
 * of the active cell redraws them. Typing in a cell changes neither, so its DOM and caret are left alone.
 */
function updatePreviewState(previous: TablePreviewState, transaction: Transaction): TablePreviewState {
  const { state } = transaction;
  const activeCell = getActiveTableCell(state);
  const isParseChanged = transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(state);

  if (!isParseChanged && isSameCellPosition(previous.activeCell, activeCell)) {
    return previous;
  }

  return buildPreviewState(isParseChanged ? findTopLevelTables(state) : previous.tables, activeCell);
}

const tablePreviewField = StateField.define<TablePreviewState>({
  create: createPreviewState,
  update: updatePreviewState,
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** A click in the note's text leaves the active cell, writing its pending edit first. */
function leaveTableOnTextClick(_event: MouseEvent, view: EditorView): boolean {
  if (getActiveTableCell(view.state)) {
    moveTableCell(view, undefined);
  }

  return false;
}

/** Draws GFM tables as grids whose cells are edited in place. */
export function tableEditor(): Extension {
  return [activeTableCellField, tablePreviewField, EditorView.domEventHandlers({ mousedown: leaveTableOnTextClick })];
}
