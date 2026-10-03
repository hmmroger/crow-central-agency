import { describe, expect, it } from "vitest";
import { history, undo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type StateEffect } from "@codemirror/state";
import {
  activeTableCellField,
  getActiveTableCell,
  setActiveTableCell,
  setTableCellDraft,
} from "./extensions/table-cell-state.js";
import type { ActiveTableCell } from "./extensions/table-cell-state.types.js";
import type { CommandTarget } from "./markdown-commands.types.js";
import {
  addTableColumn,
  addTableRow,
  canDeleteTableRow,
  commitTableCell,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  exitTable,
  goToNextTableCell,
  goToPreviousTableCell,
  goToTableRowAbove,
  goToTableRowBelow,
  insertTable,
  moveTableCell,
} from "./table-commands.js";
import { TABLE_EXIT } from "./table-commands.types.js";

const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |";

function createState(doc: string, cell?: ActiveTableCell, cursor = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage }), history(), activeTableCellField],
  });
  const effects: StateEffect<unknown>[] = [setActiveTableCell.of(cell)];

  if (cell?.draft !== undefined) {
    effects.push(setTableCellDraft.of(cell.draft));
  }

  return state.update({ effects }).state;
}

function createTarget(state: EditorState): CommandTarget {
  const target: CommandTarget = {
    state,
    dispatch: (transaction) => {
      target.state = transaction.state;
    },
  };

  return target;
}

function runCommand(state: EditorState, command: (target: CommandTarget) => boolean): EditorState {
  const target = createTarget(state);
  command(target);

  return target.state;
}

describe("table cell commit", () => {
  it("writes the edited cell and closes only that table's rows, in one undo step", () => {
    const other = "| x\n| ---";
    const state = createState(`| a | b\n| - | -\n\n${other}`, { tableFrom: 0, row: 0, column: 1, draft: "c" });
    const target = createTarget(state);

    moveTableCell(target, { tableFrom: 0, row: 0, column: 0 });

    expect(target.state.doc.toString()).toBe(`| a | c |\n| - | - |\n\n${other}`);
    expect(getActiveTableCell(target.state)).toEqual({ tableFrom: 0, row: 0, column: 0 });

    undo(target);

    expect(target.state.doc.toString()).toBe(`| a | b\n| - | -\n\n${other}`);
  });

  it("leaves an unedited table untouched", () => {
    const doc = "| a | b\n| - | -";
    const state = runCommand(createState(doc, { tableFrom: 0, row: 0, column: 0, draft: "a" }), (target) =>
      moveTableCell(target, undefined)
    );

    expect(state.doc.toString()).toBe(doc);
    expect(getActiveTableCell(state)).toBeUndefined();
  });

  it("fills an empty cell between its pipes", () => {
    const state = runCommand(
      createState("| a |  |\n| - | - |", { tableFrom: 0, row: 0, column: 1, draft: "b" }),
      (target) => moveTableCell(target, undefined)
    );

    expect(state.doc.toString()).toBe("| a | b |\n| - | - |");
  });

  it("exits below the table, adding a line at the end of the note", () => {
    const state = runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 1, draft: "3" }), (target) =>
      exitTable(target, TABLE_EXIT.AFTER)
    );

    expect(state.doc.toString()).toBe("| a | b |\n| - | - |\n| 1 | 3 |\n");
    expect(state.selection.main.head).toBe(state.doc.length);
    expect(getActiveTableCell(state)).toBeUndefined();
  });

  it("exits above the table onto the previous line", () => {
    const doc = `intro\n${TABLE}`;
    const state = runCommand(createState(doc, { tableFrom: 6, row: 0, column: 0 }), (target) =>
      exitTable(target, TABLE_EXIT.BEFORE)
    );

    expect(state.doc.toString()).toBe(doc);
    expect(state.selection.main.head).toBe(5);
  });
});

describe("table cell navigation", () => {
  it("moves along the row, wraps to the next row, then leaves below the table", () => {
    let state = runCommand(createState(TABLE, { tableFrom: 0, row: 0, column: 1, draft: "B" }), goToNextTableCell);

    expect(state.doc.toString()).toBe("| a | B |\n| - | - |\n| 1 | 2 |");
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 1, column: 0 });

    state = runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 1 }), goToNextTableCell);

    expect(getActiveTableCell(state)).toBeUndefined();
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("moves back to the previous row's last cell, then leaves above the table", () => {
    const doc = `intro\n${TABLE}`;

    expect(
      getActiveTableCell(runCommand(createState(doc, { tableFrom: 6, row: 1, column: 0 }), goToPreviousTableCell))
    ).toEqual({ tableFrom: 6, row: 0, column: 1 });

    const state = runCommand(createState(doc, { tableFrom: 6, row: 0, column: 0 }), goToPreviousTableCell);

    expect(getActiveTableCell(state)).toBeUndefined();
    expect(state.selection.main.head).toBe(5);
  });

  it("moves between rows in the same column and leaves past the first or last row", () => {
    expect(
      getActiveTableCell(runCommand(createState(TABLE, { tableFrom: 0, row: 0, column: 1 }), goToTableRowBelow))
    ).toEqual({ tableFrom: 0, row: 1, column: 1 });
    expect(
      getActiveTableCell(runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 1 }), goToTableRowAbove))
    ).toEqual({ tableFrom: 0, row: 0, column: 1 });
    expect(
      getActiveTableCell(runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 1 }), goToTableRowBelow))
    ).toBeUndefined();
    expect(
      getActiveTableCell(runCommand(createState(TABLE, { tableFrom: 0, row: 0, column: 1 }), goToTableRowAbove))
    ).toBeUndefined();
  });

  it("commits the pending edit and keeps the cell active", () => {
    const state = runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 0, draft: "9" }), commitTableCell);

    expect(state.doc.toString()).toBe("| a | b |\n| - | - |\n| 9 | 2 |");
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 1, column: 0 });
  });
});

describe("table structure commands", () => {
  it("adds a row below the active row and moves into it, keeping a pending edit", () => {
    const state = runCommand(createState(TABLE, { tableFrom: 0, row: 0, column: 1, draft: "B" }), addTableRow);

    expect(state.doc.toString()).toBe("| a | B |\n| - | - |\n|  |  |\n| 1 | 2 |");
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 1, column: 1 });
  });

  it("deletes a body row but not the header", () => {
    expect(canDeleteTableRow(createState(TABLE, { tableFrom: 0, row: 0, column: 0 }))).toBe(false);

    const state = runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 0 }), deleteTableRow);

    expect(state.doc.toString()).toBe("| a | b |\n| - | - |");
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 0, column: 0 });
  });

  it("adds a column right of the active column and moves into it", () => {
    const state = runCommand(createState(TABLE, { tableFrom: 0, row: 1, column: 0 }), addTableColumn);

    expect(state.doc.toString()).toBe("| a |  | b |\n| - | --- | - |\n| 1 |  | 2 |");
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 1, column: 1 });
  });

  it("adds a last column to rows without outer pipes", () => {
    const state = runCommand(createState("a | b\n--- | ---", { tableFrom: 0, row: 0, column: 1 }), addTableColumn);

    expect(state.doc.toString()).toBe("a | b |  |\n--- | --- | --- |");
  });

  it("deletes the active column", () => {
    const table = "| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |";

    expect(runCommand(createState(table, { tableFrom: 0, row: 0, column: 1 }), deleteTableColumn).doc.toString()).toBe(
      "| a | c |\n| - | - |\n| 1 | 3 |"
    );
    expect(runCommand(createState(table, { tableFrom: 0, row: 0, column: 0 }), deleteTableColumn).doc.toString()).toBe(
      "| b | c |\n| - | - |\n| 2 | 3 |"
    );
  });

  it("deletes the table with its last column", () => {
    const state = runCommand(createState("| a |\n| - |", { tableFrom: 0, row: 0, column: 0 }), deleteTableColumn);

    expect(state.doc.toString()).toBe("");
    expect(getActiveTableCell(state)).toBeUndefined();
  });

  it("deletes the table and the line breaks around it as one undo step", () => {
    const doc = `before\n\n${TABLE}\n\nafter`;
    const target = createTarget(createState(doc, { tableFrom: 8, row: 1, column: 1, draft: "x" }));

    deleteTable(target);

    expect(target.state.doc.toString()).toBe("before\n\nafter");
    expect(target.state.selection.main.head).toBe(7);
    expect(getActiveTableCell(target.state)).toBeUndefined();

    undo(target);

    expect(target.state.doc.toString()).toBe(doc);
  });
});

describe("insert table", () => {
  const INSERTED = "|  |  |  |\n| --- | --- | --- |\n|  |  |  |";

  it("puts the table below the line, apart from the blocks around it, and activates its first cell", () => {
    const state = runCommand(createState("text\nnext"), insertTable);

    expect(state.doc.toString()).toBe(`text\n\n${INSERTED}\n\nnext`);
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 6, row: 0, column: 0 });
  });

  it("is an undo step of its own right after typing", () => {
    const target = createTarget(createState("text", undefined, 4));

    target.dispatch(target.state.update({ changes: { from: 4, insert: "x" }, userEvent: "input.type" }));
    insertTable(target);
    undo(target);

    expect(target.state.doc.toString()).toBe("textx");
  });

  it("uses a blank line in place", () => {
    const state = runCommand(createState(""), insertTable);

    expect(state.doc.toString()).toBe(INSERTED);
    expect(getActiveTableCell(state)).toEqual({ tableFrom: 0, row: 0, column: 0 });
  });
});
