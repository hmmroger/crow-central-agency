import { useCallback, useSyncExternalStore } from "react";
import type { EditorSelector, EditorSelectorValue, LivePreviewEditorHandle } from "./live-preview-editor.types.js";

/** Re-renders only when the selected value changes, not on every transaction. */
export function useEditorSelector<T extends EditorSelectorValue>(
  editor: LivePreviewEditorHandle,
  selector: EditorSelector<T>
): T {
  const getSnapshot = useCallback(() => selector(editor.view.state), [editor, selector]);

  return useSyncExternalStore(editor.subscribe, getSnapshot);
}
