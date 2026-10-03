import type { EditorState } from "@codemirror/state";

/** 1-based source line of the main cursor */
export function getCursorLine(state: EditorState): number {
  return state.doc.lineAt(state.selection.main.head).number;
}

/** 1-based source column of the main cursor */
export function getCursorColumn(state: EditorState): number {
  const { head } = state.selection.main;

  return head - state.doc.lineAt(head).from + 1;
}
