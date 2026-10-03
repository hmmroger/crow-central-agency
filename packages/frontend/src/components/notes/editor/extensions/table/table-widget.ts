import type { EditorState } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import {
  exitTable,
  goToNextTableCell,
  goToPreviousTableCell,
  goToTableRowAbove,
  goToTableRowBelow,
  moveTableCell,
  commitTableCell,
} from "../../table-commands.js";
import { TABLE_EXIT } from "../../table-commands.types.js";
import type { CommandTarget } from "../../markdown-commands.types.js";
import type { WikilinkResolutionMap } from "../../../../../hooks/queries/use-wikilink-resolve-query.types.js";
import { releaseImageElements } from "../../../../common/note-image/image-element.js";
import { openLinkUnderPointer, PRIMARY_BUTTON } from "../click-handler.js";
import { setTableCellDraft } from "./table-cell-state.js";
import type { ActiveTableCell } from "./table-cell-state.types.js";
import {
  ensureTrailingBreak,
  hasTrailingBreak,
  readActiveCell,
  renderActiveCell,
  renderInactiveCell,
} from "./table-cell-content.js";
import type { ParsedTable, TableCell, TableRow } from "./table-syntax.types.js";
import type { CaretPoint, TextAroundCaret } from "./table-widget.types.js";

export const TABLE_WIDGET_CLASS = "cm-md-table";
export const ACTIVE_TABLE_CELL_CLASS = "cm-md-table-cell-active";

const LINE_BREAK = "\n";
const CARRIAGE_RETURN_PATTERN = /\r\n?/g;
/** Browser rich-text shortcuts that would put markup into a cell that only holds markdown text */
const RICH_TEXT_SHORTCUT_KEYS = new Set(["b", "i", "u"]);

function isSameRow(first: TableRow, second: TableRow): boolean {
  return (
    first.from === second.from &&
    first.to === second.to &&
    first.cells.length === second.cells.length &&
    first.cells.every(
      (cell, index) =>
        cell.from === second.cells[index].from &&
        cell.to === second.cells[index].to &&
        cell.content === second.cells[index].content
    )
  );
}

function isSameTable(first: ParsedTable, second: ParsedTable): boolean {
  return (
    first.from === second.from &&
    first.to === second.to &&
    isSameRow(first.header, second.header) &&
    first.delimiter.cells.length === second.delimiter.cells.length &&
    first.delimiter.cells.every((cell, index) => cell.alignment === second.delimiter.cells[index]?.alignment) &&
    first.rows.length === second.rows.length &&
    first.rows.every((row, index) => isSameRow(row, second.rows[index]))
  );
}

/** A pending edit is left out: the cell's DOM already shows it, and redrawing would lose the caret. */
function isSameActiveCell(first: ActiveTableCell | undefined, second: ActiveTableCell | undefined): boolean {
  return first?.row === second?.row && first?.column === second?.column;
}

function getActiveCellElement(event: Event): HTMLElement | undefined {
  const cell =
    event.target instanceof Element ? event.target.closest<HTMLElement>(`.${ACTIVE_TABLE_CELL_CLASS}`) : null;

  return cell ?? undefined;
}

function getTextAroundCaret(cell: HTMLElement): TextAroundCaret | undefined {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return undefined;
  }

  const caret = selection.getRangeAt(0);
  const before = document.createRange();
  const after = document.createRange();
  before.selectNodeContents(cell);
  before.setEnd(caret.startContainer, caret.startOffset);
  after.selectNodeContents(cell);
  after.setStart(caret.endContainer, caret.endOffset);
  const afterText = after.toString();

  return {
    before: before.toString(),
    after: hasTrailingBreak(cell) && afterText.endsWith(LINE_BREAK) ? afterText.slice(0, -1) : afterText,
  };
}

function placeCaret(cell: HTMLElement, point: CaretPoint | undefined): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const position =
    point && "caretPositionFromPoint" in document ? document.caretPositionFromPoint(point.x, point.y) : null;

  if (position && cell.contains(position.offsetNode)) {
    selection.collapse(position.offsetNode, position.offset);

    return;
  }

  selection.collapse(cell, hasTrailingBreak(cell) ? cell.childNodes.length - 1 : cell.childNodes.length);
}

/** Focuses the active cell's element in `view`, with the caret at `point` or at the end; false when none is drawn. */
export function focusActiveTableCell(view: EditorView, point?: CaretPoint): boolean {
  const cell = view.contentDOM.querySelector<HTMLElement>(`.${ACTIVE_TABLE_CELL_CLASS}`);

  if (!cell) {
    return false;
  }

  cell.focus();
  placeCaret(cell, point);

  return true;
}

/** A command that leaves the table hands focus back to the editor text. */
function runCellCommand(view: EditorView, command: (target: CommandTarget) => boolean): void {
  command(view);

  if (!focusActiveTableCell(view)) {
    view.focus();
  }
}

function recordDraft(view: EditorView, cell: HTMLElement): void {
  view.dispatch({ effects: setTableCellDraft.of(readActiveCell(cell)) });
}

function insertTextAtCaret(view: EditorView, cell: HTMLElement, text: string): void {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const textNode = document.createTextNode(text);
  range.deleteContents();
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  ensureTrailingBreak(cell);
  recordDraft(view, cell);
}

function getTableFrom(view: EditorView, wrapper: HTMLElement): number {
  return view.state.doc.lineAt(view.posAtDOM(wrapper)).from;
}

/** A click on a cell makes it the active cell, written through state so the table redraws it as editable. */
function handleMousedown(event: MouseEvent, view: EditorView, wrapper: HTMLElement): void {
  if (openLinkUnderPointer(event, view) || event.button !== PRIMARY_BUTTON || !(event.target instanceof Element)) {
    return;
  }

  const cell = event.target.closest("th, td");
  const row = cell?.parentElement;

  if (
    !(cell instanceof HTMLTableCellElement) ||
    !(row instanceof HTMLTableRowElement) ||
    !wrapper.contains(cell) ||
    cell.classList.contains(ACTIVE_TABLE_CELL_CLASS)
  ) {
    return;
  }

  event.preventDefault();
  moveTableCell(view, { tableFrom: getTableFrom(view, wrapper), row: row.rowIndex, column: cell.cellIndex });
  focusActiveTableCell(view, { x: event.clientX, y: event.clientY });
}

function handleKeydown(event: KeyboardEvent, view: EditorView): void {
  const cell = getActiveCellElement(event);

  if (!cell) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && RICH_TEXT_SHORTCUT_KEYS.has(event.key.toLowerCase())) {
    event.preventDefault();

    return;
  }

  switch (event.key) {
    case "Tab":
      event.preventDefault();
      runCellCommand(view, event.shiftKey ? goToPreviousTableCell : goToNextTableCell);
      break;
    case "Enter":
      event.preventDefault();
      insertTextAtCaret(view, cell, LINE_BREAK);
      break;
    case "Escape":
      event.preventDefault();
      runCellCommand(view, (target) => exitTable(target, TABLE_EXIT.AFTER));
      break;
    case "ArrowUp":
      if (getTextAroundCaret(cell)?.before.includes(LINE_BREAK) === false) {
        event.preventDefault();
        runCellCommand(view, goToTableRowAbove);
      }

      break;
    case "ArrowDown":
      if (getTextAroundCaret(cell)?.after.includes(LINE_BREAK) === false) {
        event.preventDefault();
        runCellCommand(view, goToTableRowBelow);
      }

      break;
  }
}

function handleInput(event: Event, view: EditorView): void {
  const cell = getActiveCellElement(event);

  if (cell) {
    recordDraft(view, cell);
  }
}

/** Pastes plain text only; the cell's markdown is its text, so pasted markup would be lost anyway. */
function handlePaste(event: ClipboardEvent, view: EditorView): void {
  const cell = getActiveCellElement(event);

  if (!cell) {
    return;
  }

  event.preventDefault();
  insertTextAtCaret(
    view,
    cell,
    (event.clipboardData?.getData("text/plain") ?? "").replace(CARRIAGE_RETURN_PATTERN, LINE_BREAK)
  );
}

/** Focus leaving the editor writes the pending edit so it is saved, and keeps the cell active to come back to. */
function handleFocusout(event: FocusEvent, view: EditorView): void {
  if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) {
    commitTableCell(view);
  }
}

function createCellElement(
  tagName: "th" | "td",
  cell: TableCell,
  alignment: string | undefined,
  activeCell: ActiveTableCell | undefined,
  state: EditorState
): HTMLTableCellElement {
  const element = document.createElement(tagName);

  if (alignment) {
    element.style.textAlign = alignment;
  }

  if (activeCell) {
    element.contentEditable = "true";
    element.classList.add(ACTIVE_TABLE_CELL_CLASS);
    renderActiveCell(element, activeCell.draft ?? cell.content);
  } else {
    renderInactiveCell(element, cell, state);
  }

  return element;
}

/**
 * A GFM table drawn as a grid, always, whatever the selection. Only the active cell is editable; its
 * text goes to state as a pending edit and is written to the document when the cell is left.
 */
export class TableWidget extends WidgetType {
  constructor(
    private readonly table: ParsedTable,
    private readonly activeCell: ActiveTableCell | undefined,
    private readonly resolutions: WikilinkResolutionMap
  ) {
    super();
  }

  public eq(other: TableWidget): boolean {
    return (
      isSameTable(this.table, other.table) &&
      isSameActiveCell(this.activeCell, other.activeCell) &&
      this.resolutions === other.resolutions
    );
  }

  public ignoreEvent(): boolean {
    return true;
  }

  public toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    const tableElement = document.createElement("table");
    const columnCount = this.table.header.cells.length;
    const lines = [this.table.header].concat(this.table.rows);

    wrapper.className = TABLE_WIDGET_CLASS;
    wrapper.contentEditable = "false";

    for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
      const section =
        rowIndex === 0 ? tableElement.createTHead() : (tableElement.tBodies[0] ?? tableElement.createTBody());
      const rowElement = section.insertRow();
      const cells = lines[rowIndex].cells;

      for (let column = 0; column < Math.min(cells.length, columnCount); column++) {
        const isActive = this.activeCell?.row === rowIndex && this.activeCell.column === column;
        rowElement.append(
          createCellElement(
            rowIndex === 0 ? "th" : "td",
            cells[column],
            this.table.delimiter.cells[column]?.alignment,
            isActive ? this.activeCell : undefined,
            view.state
          )
        );
      }
    }

    wrapper.append(tableElement);
    wrapper.addEventListener("mousedown", (event) => handleMousedown(event, view, wrapper));
    wrapper.addEventListener("keydown", (event) => handleKeydown(event, view));
    wrapper.addEventListener("input", (event) => handleInput(event, view));
    wrapper.addEventListener("paste", (event) => handlePaste(event, view));
    wrapper.addEventListener("focusout", (event) => handleFocusout(event, view));

    return wrapper;
  }

  public destroy(dom: HTMLElement): void {
    releaseImageElements(dom);
  }
}
