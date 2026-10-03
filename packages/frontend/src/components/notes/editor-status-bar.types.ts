import type { LivePreviewEditorHandle } from "./editor/live-preview-editor.types.js";

export const EDITOR_STATUS_TONE = {
  WARNING: "warning",
  ERROR: "error",
} as const;

export type EditorStatusTone = (typeof EDITOR_STATUS_TONE)[keyof typeof EDITOR_STATUS_TONE];

/** Surfaced in the status bar when a write failed or the note was reloaded */
export interface EditorStatusAlert {
  message: string;
  tone: EditorStatusTone;
}

export interface EditorStatusBarProps {
  editor: LivePreviewEditorHandle;
  alert?: EditorStatusAlert;
}
