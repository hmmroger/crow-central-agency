import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { EditorSubscription } from "./editor-subscription.types.js";

/** What the host gets to drive and observe a mounted editor */
export interface LivePreviewEditorHandle extends Pick<EditorSubscription, "subscribe"> {
  view: EditorView;
}

export interface LivePreviewEditorProps {
  /** The note being edited, which pasted images are saved beside; read on mount */
  noteId: string;
  /** Markdown the editor is seeded with on mount; later changes are ignored */
  markdown: string;
  onChange: (markdown: string) => void;
  onBlur: () => void;
  ariaLabel: string;
  /** Receives the handle once the view exists, and `undefined` when it is destroyed */
  onEditorReady: (editor: LivePreviewEditorHandle | undefined) => void;
  className?: string;
}

/** Selectors must return a primitive so an unchanged result skips the re-render */
export type EditorSelectorValue = string | number | boolean | undefined;

export type EditorSelector<T extends EditorSelectorValue> = (state: EditorState) => T;
