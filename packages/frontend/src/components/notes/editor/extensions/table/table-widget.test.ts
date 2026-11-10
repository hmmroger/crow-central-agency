// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { moveTableCell } from "../../table-commands.js";
import { createBaseSetup } from "../base-setup.js";
import { markdownPreview } from "../markdown-preview.js";
import { getActiveTableCell, setTableCellDraft } from "./table-cell-state.js";
import { ACTIVE_TABLE_CELL_CLASS, focusActiveTableCell, TABLE_WIDGET_CLASS } from "./table-widget.js";

const TABLE_DOC = "| a1 | b1 |\n| - | - |\n| a2 | b2 |\n| a3 | b3 |";
const MULTI_LINE_TABLE_DOC = "| a1 | b1 |\n| - | - |\n| x<br>y | b2 |\n| a3 | b3 |";
const TRAILING_BREAK_TABLE_DOC = "| a1 | b1 |\n| - | - |\n| a2 | b2<br> |";
const DRAWN_TABLE_HEIGHT = 2400;

const views: EditorView[] = [];
const resizeCallbacks: (() => void)[] = [];
const disconnectedTargets: Element[] = [];

/** jsdom has no ResizeObserver; the tests report a resize by running the callbacks themselves. */
class ResizeObserverStub {
  private readonly targets: Element[] = [];

  constructor(callback: () => void) {
    resizeCallbacks.push(callback);
  }

  public observe(target: Element): void {
    this.targets.push(target);
  }

  public disconnect(): void {
    this.targets.forEach((target) => disconnectedTargets.push(target));
  }
}

function reportTableHeight(height: number): void {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(height);
  resizeCallbacks.splice(0).forEach((callback) => callback());
}

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

function getTableWrapper(view: EditorView): HTMLElement {
  const wrapper = view.contentDOM.querySelector<HTMLElement>(`.${TABLE_WIDGET_CLASS}`);

  if (!wrapper) {
    throw new Error("no table drawn");
  }

  return wrapper;
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

function pressKey(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  getActiveCellElement(view).dispatchEvent(event);

  return event;
}

function getActivePosition(view: EditorView): [number, number] | undefined {
  const cell = getActiveTableCell(view.state);

  return cell && [cell.row, cell.column];
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  resizeCallbacks.length = 0;
  disconnectedTargets.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("table height", () => {
  it("keeps a redrawn table's height when the active cell moves", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    reportTableHeight(DRAWN_TABLE_HEIGHT);

    moveTableCell(view, { tableFrom: 0, row: 2, column: 1 });

    expect(view.lineBlockAt(0).height).toBe(DRAWN_TABLE_HEIGHT);
  });

  it("keeps the height when leaving a cell writes its edit", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    reportTableHeight(DRAWN_TABLE_HEIGHT);
    view.dispatch({ effects: setTableCellDraft.of("edited") });

    moveTableCell(view, { tableFrom: 0, row: 2, column: 1 });

    expect(view.state.doc.toString()).toContain("edited");
    expect(view.lineBlockAt(0).height).toBe(DRAWN_TABLE_HEIGHT);
  });

  it("follows the table when text is added above it", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    const intro = "intro\n\n";
    reportTableHeight(DRAWN_TABLE_HEIGHT);

    view.dispatch({ changes: { from: 0, insert: intro } });
    moveTableCell(view, { tableFrom: intro.length, row: 2, column: 1 });

    expect(view.lineBlockAt(intro.length).height).toBe(DRAWN_TABLE_HEIGHT);
  });

  it("stops observing a table that is redrawn", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    const wrapper = getTableWrapper(view);

    moveTableCell(view, { tableFrom: 0, row: 2, column: 1 });

    expect(disconnectedTargets).toContain(wrapper);
    expect(disconnectedTargets).not.toContain(getTableWrapper(view));
  });

  it("stops observing when the editor is destroyed", () => {
    const wrapper = getTableWrapper(mountTable(TABLE_DOC, 1, 0));

    views.splice(0).forEach((view) => view.destroy());

    expect(disconnectedTargets).toContain(wrapper);
  });

  it("ignores the zero height of a table that is not laid out", () => {
    const view = mountTable(TABLE_DOC, 1, 0);
    reportTableHeight(DRAWN_TABLE_HEIGHT);

    moveTableCell(view, { tableFrom: 0, row: 2, column: 0 });
    reportTableHeight(0);
    moveTableCell(view, { tableFrom: 0, row: 2, column: 1 });

    expect(view.lineBlockAt(0).height).toBe(DRAWN_TABLE_HEIGHT);
  });
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

  it("moves down onto the first line of a multi-line cell", () => {
    const view = mountTable(MULTI_LINE_TABLE_DOC, 0, 0);
    placeCaretAt(view, 1);
    pressKey(view, "ArrowDown");

    expect(getActivePosition(view)).toEqual([1, 0]);
    expect(getCaretOffset(view)).toBe(0);
  });

  it("moves up onto the last line of a multi-line cell", () => {
    const view = mountTable(MULTI_LINE_TABLE_DOC, 2, 0);
    placeCaretAt(view, 1);
    pressKey(view, "ArrowUp");

    expect(getActivePosition(view)).toEqual([1, 0]);
    expect(getCaretOffset(view)).toBe(3);
  });

  it("leaves a down arrow above a cell's line break to the browser", () => {
    const view = mountTable(MULTI_LINE_TABLE_DOC, 1, 0);
    placeCaretAt(view, 0);

    expect(pressKey(view, "ArrowDown").defaultPrevented).toBe(false);
    expect(getActivePosition(view)).toEqual([1, 0]);
  });
});

describe("table cell select all", () => {
  it("selects only the active cell's text", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 0);

    expect(pressKey(view, "a", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe("b2");
    expect(getActivePosition(view)).toEqual([1, 1]);
  });

  it("leaves out the display-only trailing line break", () => {
    const view = mountTable(TRAILING_BREAK_TABLE_DOC, 1, 1);

    pressKey(view, "a", { metaKey: true });

    expect(window.getSelection()?.toString()).toBe("b2\n");
  });

  it("leaves Ctrl+Shift+A to the browser", () => {
    const view = mountTable(TABLE_DOC, 1, 1);
    placeCaretAt(view, 0);

    expect(pressKey(view, "A", { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  });
});
