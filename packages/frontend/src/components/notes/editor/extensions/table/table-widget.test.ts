// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { moveTableCell } from "../../table-commands.js";
import { createBaseSetup } from "../base-setup.js";
import { markdownPreview } from "../markdown-preview.js";
import { getActiveTableCell } from "./table-cell-state.js";
import { ACTIVE_TABLE_CELL_CLASS, focusActiveTableCell } from "./table-widget.js";

const TABLE_DOC = "| a1 | b1 |\n| - | - |\n| a2 | b2 |\n| a3 | b3 |";

const views: EditorView[] = [];

function mountTable(doc: string, row: number, column: number): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc, extensions: [createBaseSetup(), markdownPreview()] }),
  });

  views.push(view);
  moveTableCell(view, { tableFrom: 0, row, column });
  focusActiveTableCell(view);

  return view;
}

function getActiveCellElement(view: EditorView): HTMLElement {
  const cell = view.contentDOM.querySelector<HTMLElement>(`.${ACTIVE_TABLE_CELL_CLASS}`);

  if (!cell) {
    throw new Error("no active cell drawn");
  }

  return cell;
}

function placeCaretAt(view: EditorView, offset: number): void {
  const cell = getActiveCellElement(view);
  const textNode = cell.firstChild;

  if (!textNode) {
    throw new Error("active cell has no text");
  }

  window.getSelection()?.collapse(textNode, offset);
}

function getCaretOffset(view: EditorView): number {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    throw new Error("no selection");
  }

  const range = document.createRange();
  range.selectNodeContents(getActiveCellElement(view));
  range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);

  return range.toString().length;
}

function pressKey(view: EditorView, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  getActiveCellElement(view).dispatchEvent(event);

  return event;
}

function getActivePosition(view: EditorView): [number, number] | undefined {
  const cell = getActiveTableCell(view.state);

  return cell && [cell.row, cell.column];
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

describe("table cell arrow keys", () => {
  it("moves right from the end of a cell to the start of the next cell", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    placeCaretAt(view, 2);

    expect(pressKey(view, "ArrowRight").defaultPrevented).toBe(true);
    expect(getActivePosition(view)).toEqual([1, 1]);
    expect(getActiveCellElement(view).textContent).toBe("b2");
    expect(getCaretOffset(view)).toBe(0);
  });

  it("moves right from the end of a row to the first cell of the next row", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 2);
    pressKey(view, "ArrowRight");

    expect(getActivePosition(view)).toEqual([2, 0]);
  });

  it("leaves a right arrow inside the text to the browser", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    placeCaretAt(view, 1);

    expect(pressKey(view, "ArrowRight").defaultPrevented).toBe(false);
    expect(getActivePosition(view)).toEqual([1, 0]);
  });

  it("moves left from the start of a cell to the end of the previous cell", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 0);

    expect(pressKey(view, "ArrowLeft").defaultPrevented).toBe(true);
    expect(getActivePosition(view)).toEqual([1, 0]);
    expect(getCaretOffset(view)).toBe(2);
  });

  it("moves left from the start of a row to the last cell of the previous row", () => {
    const view = mountTable(TABLE_DOC, 2, 0);
    placeCaretAt(view, 0);
    pressKey(view, "ArrowLeft");

    expect(getActivePosition(view)).toEqual([1, 1]);
  });

  it("leaves a left arrow inside the text to the browser", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 1);

    expect(pressKey(view, "ArrowLeft").defaultPrevented).toBe(false);
    expect(getActivePosition(view)).toEqual([1, 1]);
  });

  it("moves down to the cell below in the same column", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 1);

    expect(pressKey(view, "ArrowDown").defaultPrevented).toBe(true);
    expect(getActivePosition(view)).toEqual([2, 1]);
  });

  it("moves up from a body row to the header cell in the same column", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 1);

    expect(pressKey(view, "ArrowUp").defaultPrevented).toBe(true);
    expect(getActivePosition(view)).toEqual([0, 1]);
  });

  it("moves down from the header to the first body row", () => {
    const view = mountTable(TABLE_DOC, 0, 0);
    placeCaretAt(view, 1);
    pressKey(view, "ArrowDown");

    expect(getActivePosition(view)).toEqual([1, 0]);
  });
});
