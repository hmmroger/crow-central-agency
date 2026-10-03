import type { ComponentType } from "react";
import type { ActionButtonVariant } from "../common/action-button.js";
import type { EditorFormatState, MarkdownEditorHandle } from "./editor/markdown-editor.types.js";

/** A formatting control, resolved against the formatting the editor reports at the cursor */
export interface EditorCommand {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Edits the markdown at the selection */
  run: (editor: MarkdownEditorHandle) => void;
  isActive: (formatState: EditorFormatState) => boolean;
  /** Whether the command applies at the cursor */
  canRun: (formatState: EditorFormatState) => boolean;
  variant?: ActionButtonVariant;
}

/** A visually separated run of related controls */
export interface EditorCommandGroup {
  name: string;
  commands: EditorCommand[];
}

export interface EditorToolbarProps {
  editor: MarkdownEditorHandle;
  formatState: EditorFormatState;
}

export interface EditorToolbarButtonProps {
  editor: MarkdownEditorHandle;
  formatState: EditorFormatState;
  command: EditorCommand;
}

export interface EditorLinkButtonProps {
  editor: MarkdownEditorHandle;
  formatState: EditorFormatState;
}

export interface EditorTableGroupProps {
  editor: MarkdownEditorHandle;
  formatState: EditorFormatState;
  className?: string;
}
