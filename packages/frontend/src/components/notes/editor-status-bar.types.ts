import type { EditorStatus } from "./editor/markdown-editor.types.js";

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
  status: EditorStatus;
  alert?: EditorStatusAlert;
}
