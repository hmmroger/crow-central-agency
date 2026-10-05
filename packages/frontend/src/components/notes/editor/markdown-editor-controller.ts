import type { EditorView } from "@codemirror/view";
import { focusActiveTableCell } from "./extensions/table/table-widget.js";
import {
  insertDivider,
  removeLink,
  setLink,
  setParagraph,
  toggleBlockquote,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineFormat,
  toggleList,
} from "./markdown-commands.js";
import type { CommandTarget, InlineFormat, ListKind } from "./markdown-commands.types.js";
import type { MarkdownEditorHandle } from "./markdown-editor.types.js";
import {
  addTableColumn,
  addTableRow,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  insertTable,
} from "./table-commands.js";

/** Runs each edit on the view and hands focus back to it, or to the active table cell. */
export class MarkdownEditorController implements MarkdownEditorHandle {
  constructor(private readonly view: EditorView) {}

  public focus(): void {
    if (!focusActiveTableCell(this.view)) {
      this.view.focus();
    }
  }

  public setParagraph(): void {
    this.run(setParagraph);
  }

  public toggleHeading(level: number): void {
    this.run((target) => toggleHeading(target, level));
  }

  public toggleInlineFormat(format: InlineFormat): void {
    this.run((target) => toggleInlineFormat(target, format));
  }

  public toggleList(kind: ListKind): void {
    this.run((target) => toggleList(target, kind));
  }

  public toggleBlockquote(): void {
    this.run(toggleBlockquote);
  }

  public toggleCodeBlock(): void {
    this.run(toggleCodeBlock);
  }

  public insertDivider(): void {
    this.run(insertDivider);
  }

  public setLink(text: string, url: string): void {
    this.run((target) => setLink(target, text, url));
  }

  public removeLink(): void {
    this.run(removeLink);
  }

  public insertTable(): void {
    this.run(insertTable);
  }

  public addTableRow(): void {
    this.run(addTableRow);
  }

  public addTableColumn(): void {
    this.run(addTableColumn);
  }

  public deleteTableRow(): void {
    this.run(deleteTableRow);
  }

  public deleteTableColumn(): void {
    this.run(deleteTableColumn);
  }

  public deleteTable(): void {
    this.run(deleteTable);
  }

  private run(command: (target: CommandTarget) => boolean): void {
    command(this.view);
    this.focus();
  }
}
