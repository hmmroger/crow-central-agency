import type { ComponentType } from "react";
import type { EditorState } from "@codemirror/state";
import type { ActionButtonVariant } from "../common/action-button.js";
import type { LivePreviewEditorHandle } from "./editor/live-preview-editor.types.js";
import type { CommandTarget } from "./editor/markdown-commands.types.js";

/**
 * A formatting control, resolved against the live editor rather than against
 * stored state, so the toolbar never has to mirror the document.
 */
export interface EditorCommand {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Edits the markdown at the selection */
  run: (target: CommandTarget) => boolean;
  /** Reads the syntax tree at the cursor; must be a stable function */
  isActive: (state: EditorState) => boolean;
  /** Whether the command applies in this state; must be a stable function */
  canRun: (state: EditorState) => boolean;
  variant?: ActionButtonVariant;
}

/** A visually separated run of related controls */
export interface EditorCommandGroup {
  name: string;
  commands: EditorCommand[];
}

export interface EditorToolbarProps {
  editor: LivePreviewEditorHandle;
}

export interface EditorToolbarButtonProps {
  editor: LivePreviewEditorHandle;
  command: EditorCommand;
}

export interface EditorLinkButtonProps {
  editor: LivePreviewEditorHandle;
}

export interface EditorTableGroupProps {
  editor: LivePreviewEditorHandle;
  className?: string;
}
