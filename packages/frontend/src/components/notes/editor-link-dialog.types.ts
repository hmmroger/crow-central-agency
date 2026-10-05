import type { EditorLink, MarkdownEditorHandle } from "./editor/markdown-editor.types.js";

export interface EditorLinkDialogOptions {
  editor: MarkdownEditorHandle;
  /** The link at the cursor, which the dialog edits; `undefined` adds a new link */
  link: EditorLink | undefined;
  /** Prefills the label of a new link */
  selectedText: string | undefined;
}

export interface EditorLinkDialogProps extends EditorLinkDialogOptions {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}
