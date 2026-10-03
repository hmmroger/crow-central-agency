import type { EditorState } from "@codemirror/state";
import { getEditorError } from "./extensions/editor-error-state.js";
import { isTableCellActive } from "./extensions/table/table-cell-state.js";
import {
  getHeadingLevel,
  getListKind,
  isBlockquoteActive,
  isCodeBlockActive,
  isInlineFormatActive,
  isLinkActive,
} from "./markdown-commands.js";
import { INLINE_FORMAT } from "./markdown-commands.types.js";
import type { EditorFormatState, EditorStatus, MarkdownEditorProps } from "./markdown-editor.types.js";
import { canDeleteTableRow } from "./table-commands.js";

const INLINE_FORMATS = Object.values(INLINE_FORMAT);

/** Tells the host about the formatting at the cursor and the editor status, only when either changes. */
export class EditorStateReporter {
  private formatState: EditorFormatState | undefined;
  private status: EditorStatus | undefined;

  constructor(
    private readonly onFormatStateChange: MarkdownEditorProps["onFormatStateChange"],
    private readonly onStatusChange: MarkdownEditorProps["onStatusChange"]
  ) {}

  public report(state: EditorState): void {
    const formatState = this.getFormatState(state);
    const status = this.getStatus(state);

    if (!this.formatState || !this.isSameFormatState(this.formatState, formatState)) {
      this.formatState = formatState;
      this.onFormatStateChange(formatState);
    }

    if (!this.status || !this.isSameStatus(this.status, status)) {
      this.status = status;
      this.onStatusChange(status);
    }
  }

  private getFormatState(state: EditorState): EditorFormatState {
    return {
      headingLevel: getHeadingLevel(state),
      listKind: getListKind(state),
      inlineFormats: INLINE_FORMATS.filter((format) => isInlineFormatActive(state, format)),
      isBlockquote: isBlockquoteActive(state),
      isCodeBlock: isCodeBlockActive(state),
      isLink: isLinkActive(state),
      isInTableCell: isTableCellActive(state),
      canDeleteTableRow: canDeleteTableRow(state),
    };
  }

  private getStatus(state: EditorState): EditorStatus {
    const { head } = state.selection.main;
    const line = state.doc.lineAt(head);

    return { line: line.number, column: head - line.from + 1, error: getEditorError(state) };
  }

  private isSameFormatState(first: EditorFormatState, second: EditorFormatState): boolean {
    return (
      first.headingLevel === second.headingLevel &&
      first.listKind === second.listKind &&
      first.inlineFormats.length === second.inlineFormats.length &&
      first.inlineFormats.every((format, index) => format === second.inlineFormats[index]) &&
      first.isBlockquote === second.isBlockquote &&
      first.isCodeBlock === second.isCodeBlock &&
      first.isLink === second.isLink &&
      first.isInTableCell === second.isInTableCell &&
      first.canDeleteTableRow === second.canDeleteTableRow
    );
  }

  private isSameStatus(first: EditorStatus, second: EditorStatus): boolean {
    return first.line === second.line && first.column === second.column && first.error === second.error;
  }
}
