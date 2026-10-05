import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type ChangeSet,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { SYNTAX_NODE } from "./extensions/markdown-syntax.types.js";
import { getActiveTableCell, setActiveTableCell } from "./extensions/table/table-cell-state.js";
import type { TableCellPosition } from "./extensions/table/table-cell-state.types.js";
import { getTableRow, getTableRowCount, parseTable } from "./extensions/table/table-syntax.js";
import type { ParsedTable, TableLine, TextRange } from "./extensions/table/table-syntax.types.js";
import type { CommandTarget } from "./markdown-commands.types.js";
import { TABLE_EXIT, type ActiveTable, type TableEdit, type TableExit } from "./table-commands.types.js";

const NEW_TABLE_COLUMNS = 3;
const EMPTY_CELL = "  |";
const DELIMITER_CELL = " --- |";
const NEW_COLUMN_CELL = " | ";
const NEW_DELIMITER_CELL = " | ---";
const TRAILING_PIPE = " |";

/** The top-level table whose header line starts at `lineFrom`, parsed from the current syntax tree. */
export function findTableAt(state: EditorState, lineFrom: number): ParsedTable | undefined {
  const tableNode = syntaxTree(state).topNode.childAfter(lineFrom);

  if (tableNode?.name !== SYNTAX_NODE.TABLE || state.doc.lineAt(tableNode.from).from !== lineFrom) {
    return undefined;
  }

  return parseTable(state, tableNode);
}

/** The top-level table whose source covers `position`, its first and last positions included. */
export function findTableAround(state: EditorState, position: number): ParsedTable | undefined {
  const { topNode } = syntaxTree(state);
  const tableNode = [topNode.childAfter(position), topNode.childBefore(position)].find(
    (syntaxNode) => syntaxNode?.name === SYNTAX_NODE.TABLE && syntaxNode.from <= position && position <= syntaxNode.to
  );

  return tableNode ? parseTable(state, tableNode) : undefined;
}

function getTableLines(table: ParsedTable): TableLine<TextRange>[] {
  return [table.header, table.delimiter].concat(table.rows);
}

/** Closes lines that end without a pipe, so emptying their last cell cannot drop it. */
function getTrailingPipeChanges(lines: TableLine<TextRange>[]): ChangeSpec[] {
  const changes: ChangeSpec[] = [];

  for (const line of lines) {
    if (!line.hasTrailingPipe) {
      changes.push({ from: line.to, insert: TRAILING_PIPE });
    }
  }

  return changes;
}

export function findActiveTable(state: EditorState): ActiveTable | undefined {
  const cell = getActiveTableCell(state);
  const table = cell && findTableAt(state, cell.tableFrom);

  return cell && table ? { table, cell } : undefined;
}

function getDraftChanges({ table, cell }: ActiveTable): ChangeSpec[] {
  const target = getTableRow(table, cell.row)?.cells[cell.column];

  if (cell.draft === undefined || !target || target.content === cell.draft) {
    return [];
  }

  return [{ from: target.from, to: target.to, insert: cell.draft }];
}

/** An unchanged cell writes nothing, so leaving it never rewrites the table. */
function getCellCommitChanges(active: ActiveTable): ChangeSpec[] {
  const draftChanges = getDraftChanges(active);

  return draftChanges.length > 0 ? draftChanges.concat(getTrailingPipeChanges(getTableLines(active.table))) : [];
}

/** Removes a cell with one of the pipes beside it: the following pipe for the first cell, else the preceding one. */
function getCellDeleteRange(cells: TextRange[], column: number): TextRange | undefined {
  const cell = cells[column];

  if (!cell) {
    return undefined;
  }

  const next = cells[column + 1];
  const previous = cells[column - 1];

  if (column === 0) {
    return next ? { from: cell.from, to: next.from } : undefined;
  }

  return previous ? { from: previous.to, to: cell.to } : undefined;
}

function createEmptyRow(columnCount: number): string {
  return `|${EMPTY_CELL.repeat(columnCount)}`;
}

function getEditSelection(edit: TableEdit, changes: ChangeSet): EditorSelection | undefined {
  if (edit.cursor) {
    return EditorSelection.single(changes.mapPos(edit.cursor.position, edit.cursor.assoc));
  }

  return edit.selection?.map(changes);
}

function buildTableEditSpec(state: EditorState, edit: TableEdit): TransactionSpec {
  const changes = state.changes(edit.changes);
  const nextCell = edit.nextCell && {
    tableFrom: changes.mapPos(edit.nextCell.tableFrom, -1),
    row: edit.nextCell.row,
    column: edit.nextCell.column,
  };

  return {
    changes,
    selection: getEditSelection(edit, changes),
    effects: setActiveTableCell.of(nextCell),
    annotations: changes.empty ? undefined : isolateHistory.of("full"),
  };
}

function applyTableEdit(target: CommandTarget, edit: TableEdit): boolean {
  target.dispatch(target.state.update(buildTableEditSpec(target.state, edit)));

  return true;
}

/**
 * Writes the active cell's edit, then makes `next` the active cell, or none, keeping `selection` when given;
 * positions refer to `state`'s document.
 */
export function buildMoveTableCellSpec(
  state: EditorState,
  next: TableCellPosition | undefined,
  selection?: EditorSelection
): TransactionSpec {
  const active = findActiveTable(state);

  return buildTableEditSpec(state, {
    changes: active ? getCellCommitChanges(active) : [],
    nextCell: next,
    selection,
  });
}

export function canDeleteTableRow(state: EditorState): boolean {
  const cell = getActiveTableCell(state);

  return cell !== undefined && cell.row > 0;
}

/** Writes the active cell's edit, then makes `next` the active cell, or none. */
export function moveTableCell(target: CommandTarget, next: TableCellPosition | undefined): boolean {
  target.dispatch(target.state.update(buildMoveTableCellSpec(target.state, next)));

  return true;
}

/** Writes the active cell's edit and puts the cursor on the line before or after the table, adding one if needed. */
export function exitTable(target: CommandTarget, exit: TableExit): boolean {
  const { state } = target;
  const active = findActiveTable(state);

  if (!active) {
    return moveTableCell(target, undefined);
  }

  const { table } = active;
  const changes = getCellCommitChanges(active);

  if (exit === TABLE_EXIT.AFTER) {
    if (table.to >= state.doc.length) {
      changes.push({ from: table.to, insert: "\n" });
    }

    return applyTableEdit(target, {
      changes,
      cursor: { position: Math.min(table.to + 1, state.doc.length), assoc: 1 },
    });
  }

  if (table.from === 0) {
    changes.unshift({ from: 0, insert: "\n" });
  }

  return applyTableEdit(target, { changes, cursor: { position: Math.max(table.from - 1, 0), assoc: -1 } });
}

/** Writes the active cell's edit and keeps the cell active, as when focus leaves the editor. */
export function commitTableCell(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);
  const changes = active ? getCellCommitChanges(active) : [];

  if (!active || changes.length === 0) {
    return false;
  }

  return applyTableEdit(target, { changes, nextCell: active.cell });
}

/** Along the row, then to the next row's first cell; past the last cell leaves the table below it. */
export function goToNextTableCell(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;

  if (cell.column + 1 < table.header.cells.length) {
    return moveTableCell(target, { tableFrom: cell.tableFrom, row: cell.row, column: cell.column + 1 });
  }

  if (cell.row + 1 < getTableRowCount(table)) {
    return moveTableCell(target, { tableFrom: cell.tableFrom, row: cell.row + 1, column: 0 });
  }

  return exitTable(target, TABLE_EXIT.AFTER);
}

/** Back along the row, then to the previous row's last cell; before the first cell leaves the table above it. */
export function goToPreviousTableCell(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;

  if (cell.column > 0) {
    return moveTableCell(target, { tableFrom: cell.tableFrom, row: cell.row, column: cell.column - 1 });
  }

  if (cell.row > 0) {
    return moveTableCell(target, {
      tableFrom: cell.tableFrom,
      row: cell.row - 1,
      column: table.header.cells.length - 1,
    });
  }

  return exitTable(target, TABLE_EXIT.BEFORE);
}

function goToTableRow(target: CommandTarget, rowOffset: number, exit: TableExit): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;
  const row = cell.row + rowOffset;

  if (row < 0 || row >= getTableRowCount(table)) {
    return exitTable(target, exit);
  }

  return moveTableCell(target, { tableFrom: cell.tableFrom, row, column: cell.column });
}

/** The cell above in the same column; from the header row it leaves the table above it. */
export function goToTableRowAbove(target: CommandTarget): boolean {
  return goToTableRow(target, -1, TABLE_EXIT.BEFORE);
}

/** The cell below in the same column; from the last row it leaves the table below it. */
export function goToTableRowBelow(target: CommandTarget): boolean {
  return goToTableRow(target, 1, TABLE_EXIT.AFTER);
}

/** Adds an empty row below the active cell's row and moves into it. */
export function addTableRow(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;
  const lineAbove = cell.row === 0 ? table.delimiter : getTableRow(table, cell.row);

  if (!lineAbove) {
    return false;
  }

  const changes = getDraftChanges(active).concat(getTrailingPipeChanges(getTableLines(table)), {
    from: lineAbove.to,
    insert: `\n${createEmptyRow(table.header.cells.length)}`,
  });

  return applyTableEdit(target, { changes, nextCell: { ...cell, row: cell.row + 1 } });
}

/** Deletes the active cell's body row; the header row cannot be deleted. */
export function deleteTableRow(target: CommandTarget): boolean {
  const { state } = target;
  const active = findActiveTable(state);
  const row = active && active.cell.row > 0 ? getTableRow(active.table, active.cell.row) : undefined;

  if (!active || !row) {
    return false;
  }

  const { table, cell } = active;
  const keptLines = getTableLines(table).filter((line) => line !== row);
  const changes = getTrailingPipeChanges(keptLines).concat({ from: state.doc.lineAt(row.from).from - 1, to: row.to });
  const nextRow = Math.min(cell.row, getTableRowCount(table) - 2);

  return applyTableEdit(target, { changes, nextCell: { ...cell, row: nextRow } });
}

/** Adds an empty column right of the active cell's column and moves into it. */
export function addTableColumn(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;
  const changes = getDraftChanges(active);
  const unclosedLines: TableLine<TextRange>[] = [];

  for (const line of getTableLines(table)) {
    const lineCell = line.cells[cell.column];
    const newCell = line === table.delimiter ? NEW_DELIMITER_CELL : NEW_COLUMN_CELL;
    // A new last cell and the missing closing pipe share one position, so one insert writes both in order.
    const closesLine = lineCell !== undefined && lineCell.to === line.to && !line.hasTrailingPipe;

    if (lineCell) {
      changes.push({ from: lineCell.to, insert: closesLine ? `${newCell}${TRAILING_PIPE}` : newCell });
    }

    if (!closesLine) {
      unclosedLines.push(line);
    }
  }

  return applyTableEdit(target, {
    changes: changes.concat(getTrailingPipeChanges(unclosedLines)),
    nextCell: { ...cell, column: cell.column + 1 },
  });
}

/** Deletes the active cell's column, or the whole table when it is the last column. */
export function deleteTableColumn(target: CommandTarget): boolean {
  const active = findActiveTable(target.state);

  if (!active) {
    return false;
  }

  const { table, cell } = active;
  const columnCount = table.header.cells.length;

  if (columnCount <= 1) {
    return deleteTable(target);
  }

  const changes: ChangeSpec[] = [];

  for (const line of getTableLines(table)) {
    const range = getCellDeleteRange(line.cells, cell.column);

    if (range) {
      changes.push(range);
    }
  }

  return applyTableEdit(target, {
    changes: changes.concat(getTrailingPipeChanges(getTableLines(table))),
    nextCell: { ...cell, column: Math.min(cell.column, columnCount - 2) },
  });
}

/** Deletes the active cell's table with the line breaks around it, dropping any pending cell edit. */
export function deleteTable(target: CommandTarget): boolean {
  const { state } = target;
  const active = findActiveTable(state);

  if (!active) {
    return false;
  }

  const { table } = active;
  const from = table.from > 0 ? table.from - 1 : table.from;
  const to = table.to < state.doc.length ? table.to + 1 : table.to;

  return applyTableEdit(target, { changes: [{ from, to }], cursor: { position: from, assoc: -1 } });
}

/**
 * Puts a table with a header row and one body row on its own lines at the cursor's line, apart from the
 * blocks around it so neither becomes part of the table, and activates its first header cell, which takes the cursor.
 */
export function insertTable(target: CommandTarget): boolean {
  const { state } = target;
  const line = state.doc.lineAt(state.selection.main.head);
  const isBlankLine = line.text.trim() === "";
  const previousLine = line.number > 1 ? state.doc.line(line.number - 1) : undefined;
  const nextLine = line.number < state.doc.lines ? state.doc.line(line.number + 1) : undefined;
  const needsBlankLineBefore = isBlankLine ? previousLine !== undefined && previousLine.text.trim() !== "" : true;
  const needsBlankLineAfter = nextLine !== undefined && nextLine.text.trim() !== "";
  const emptyRow = createEmptyRow(NEW_TABLE_COLUMNS);
  const table = [emptyRow, `|${DELIMITER_CELL.repeat(NEW_TABLE_COLUMNS)}`, emptyRow].join("\n");
  const prefix = `${needsBlankLineBefore ? "\n" : ""}${isBlankLine ? "" : "\n"}`;
  const from = isBlankLine ? line.from : line.to;
  const tableFrom = from + prefix.length;

  target.dispatch(
    state.update({
      changes: {
        from,
        to: isBlankLine ? line.to : from,
        insert: `${prefix}${table}${needsBlankLineAfter ? "\n" : ""}`,
      },
      effects: setActiveTableCell.of({ tableFrom, row: 0, column: 0 }),
      annotations: isolateHistory.of("full"),
    })
  );

  return true;
}
