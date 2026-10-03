import { EditorView } from "@codemirror/view";
import type { EditorSubscription } from "./editor-subscription.types.js";

/** Lets code outside the view observe it without adding its own extension. */
export function createEditorSubscription(): EditorSubscription {
  const listeners = new Set<() => void>();

  return {
    extension: EditorView.updateListener.of((update) => {
      if (update.transactions.length > 0) {
        listeners.forEach((listener) => listener());
      }
    }),
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
