import type { EditorStatusAlert } from "./editor-status-bar.types.js";

export interface MarkdownEditorProps {
  /** The note being edited, which pasted images are saved beside */
  noteId: string;
  /** Markdown the editor is seeded with on mount */
  markdown: string;
  /** Called with serialized markdown on every document change */
  onChange: (markdown: string) => void;
  /** Called when focus leaves the canvas, so the host can flush a pending save */
  onBlur: () => void;
  /** Shown in the status bar when a write failed or the note was reloaded */
  alert?: EditorStatusAlert;
  ariaLabel: string;
}
