// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBaseSetup } from "./base-setup.js";
import { markdownPreview } from "./markdown-preview.js";
import { getActiveTableCell } from "./table-cell-state.js";
import { tableEditor } from "./table-editor.js";

const TABLE = "| a | **b** |\n| - | - |\n| [x](https://e.com) | 2 |";
const OTHER_TABLE = "| y\n| ---";
const views: EditorView[] = [];

function mountEditor(doc: string, cursor = 0): EditorView {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [createBaseSetup(), markdownPreview(), tableEditor()],
    }),
  });

  views.push(view);

  return view;
}

function getCells(view: EditorView): HTMLTableCellElement[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLTableCellElement>(".cm-md-table :is(th, td)"));
}

function pressMouse(element: Element): void {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
}

function pressKey(element: Element, key: string, shiftKey = false): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, shiftKey }));
}

function typeInto(element: HTMLElement, text: string): void {
  element.textContent = text;
  element.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
});

describe("table editor", () => {
  it("draws a table as one grid widget with its syntax hidden, whatever the selection", () => {
    const doc = `intro\n\n${TABLE}\n\nend`;
    const view = mountEditor(doc, doc.indexOf("**b**") + 3);
    const cells = getCells(view);

    expect(view.contentDOM.querySelectorAll(".cm-md-table")).toHaveLength(1);
    expect(cells.map((cell) => cell.textContent)).toEqual(["a", "b", "x", "2"]);
    expect(cells[1].querySelector(".cm-md-strong")?.textContent).toBe("b");
    expect(cells[2].querySelector(".cm-md-link")?.getAttribute("data-url")).toBe("https://e.com");
    expect(view.contentDOM.textContent).not.toContain("|");
  });

  it("draws an image in an inactive cell and shows its markdown while the cell is edited", () => {
    const image = "![cat](https://example.com/cat.png)";
    const view = mountEditor(`| ${image} ![[nowhere.png]] |\n| - |`);
    const [cell] = getCells(view);

    expect(cell.querySelector(".cm-md-image img")?.getAttribute("src")).toBe("https://example.com/cat.png");
    expect(cell.querySelector(".cm-md-image-missing")?.textContent).toBe("Missing image: nowhere.png");

    pressMouse(cell);

    expect(view.contentDOM.querySelector(".cm-md-table-cell-active")?.textContent).toBe(`${image} ![[nowhere.png]]`);
  });

  it("draws a linked image in a cell inside that link", () => {
    const view = mountEditor("| [![cat](https://example.com/cat.png)](https://example.com/page) |\n| - |");
    const image = getCells(view)[0].querySelector(".cm-md-image");

    expect(image?.closest(".cm-md-link")?.getAttribute("data-url")).toBe("https://example.com/page");
  });

  it("keeps block syntax in a cell as text", () => {
    const view = mountEditor("| # x |\n| - |");

    expect(getCells(view)[0].textContent).toBe("# x");
  });

  it("does not redraw a table on a selection change", () => {
    const doc = `intro\n\n${TABLE}`;
    const view = mountEditor(doc);
    const tableElement = view.contentDOM.querySelector(".cm-md-table");

    view.dispatch({ selection: { anchor: 3 } });

    expect(view.contentDOM.querySelector(".cm-md-table")).toBe(tableElement);
  });

  it("edits a clicked cell in place and writes it on Tab, closing only that table, as one undo step", () => {
    const doc = `${TABLE.replace("| 2 |", "| 2")}\n\n${OTHER_TABLE}`;
    const view = mountEditor(doc);

    pressMouse(getCells(view)[3]);

    const active = view.contentDOM.querySelector<HTMLElement>(".cm-md-table-cell-active");

    expect(getActiveTableCell(view.state)).toEqual({ tableFrom: 0, row: 1, column: 1 });
    expect(active?.textContent).toBe("2");

    if (!active) {
      return;
    }

    typeInto(active, "3|4");
    pressKey(active, "Tab");

    expect(view.state.doc.toString()).toBe(`${TABLE.replace("| 2 |", "| 3\\|4 |")}\n\n${OTHER_TABLE}`);
    expect(getActiveTableCell(view.state)).toBeUndefined();

    undo(view);

    expect(view.state.doc.toString()).toBe(doc);
  });

  it("shows raw markdown in the active cell and writes line breaks as <br>", () => {
    const view = mountEditor(TABLE);

    pressMouse(getCells(view)[1]);

    const active = view.contentDOM.querySelector<HTMLElement>(".cm-md-table-cell-active");

    expect(active?.textContent).toBe("**b**");

    if (!active) {
      return;
    }

    typeInto(active, "one\ntwo");
    pressKey(active, "Escape");

    expect(view.state.doc.line(1).text).toBe("| a | one<br>two |");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("writes the pending edit when focus leaves the page, keeping the cell active", () => {
    const view = mountEditor(TABLE);

    pressMouse(getCells(view)[0]);

    const active = view.contentDOM.querySelector<HTMLElement>(".cm-md-table-cell-active");

    if (!active) {
      throw new Error("no active cell");
    }

    typeInto(active, "z");
    active.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(view.state.doc.line(1).text).toBe("| z | **b** |");
    expect(getActiveTableCell(view.state)).toEqual({ tableFrom: 0, row: 0, column: 0 });
  });

  it("does not rewrite a table whose cell was entered and left unchanged", () => {
    const doc = "| a | b\n| - | -";
    const view = mountEditor(doc);

    pressMouse(getCells(view)[0]);

    const active = view.contentDOM.querySelector(".cm-md-table-cell-active");

    if (active) {
      pressKey(active, "Tab");
    }

    expect(view.state.doc.toString()).toBe(doc);
    expect(getActiveTableCell(view.state)).toEqual({ tableFrom: 0, row: 0, column: 1 });
  });
});
