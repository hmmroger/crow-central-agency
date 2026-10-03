import { StateEffect, StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const setEditorError = StateEffect.define<string>();

/** Any edit clears the last error, since the user has moved on. */
function updateEditorError(error: string | undefined, transaction: Transaction): string | undefined {
  return transaction.effects.reduce<string | undefined>(
    (current, effect) => (effect.is(setEditorError) ? effect.value : current),
    transaction.docChanged ? undefined : error
  );
}

const editorErrorField = StateField.define<string | undefined>({
  create: () => undefined,
  update: updateEditorError,
});

export function showEditorError(view: EditorView, message: string): void {
  view.dispatch({ effects: setEditorError.of(message) });
}

/** Why the last editor action that works behind the scenes, an image paste, failed. */
export function getEditorError(state: EditorState): string | undefined {
  return state.field(editorErrorField, false);
}

export function editorError(): Extension {
  return editorErrorField;
}
