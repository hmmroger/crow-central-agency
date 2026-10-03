import type { Extension } from "@codemirror/state";

export interface EditorSubscription {
  extension: Extension;
  subscribe: (listener: () => void) => () => void;
}
