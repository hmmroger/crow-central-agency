import { cn } from "../../utils/cn.js";
import { getCursorColumn, getCursorLine } from "./editor/cursor-position.js";
import { getEditorError } from "./editor/extensions/editor-error-state.js";
import { useEditorSelector } from "./editor/use-editor-selector.js";
import { EDITOR_STATUS_TONE, type EditorStatusBarProps, type EditorStatusTone } from "./editor-status-bar.types.js";

const TONE_CLASSES: Record<EditorStatusTone, string> = {
  [EDITOR_STATUS_TONE.WARNING]: "text-warning",
  [EDITOR_STATUS_TONE.ERROR]: "text-error",
};

/** Cursor position in the markdown source, plus any alert the last write or editor action raised. */
export function EditorStatusBar({ editor, alert }: EditorStatusBarProps) {
  const line = useEditorSelector(editor, getCursorLine);
  const column = useEditorSelector(editor, getCursorColumn);
  const editorError = useEditorSelector(editor, getEditorError);
  const shownAlert =
    alert ?? (editorError === undefined ? undefined : { message: editorError, tone: EDITOR_STATUS_TONE.ERROR });

  return (
    <div className="flex items-center gap-2 border-t border-border-subtle px-2 py-2 text-xs">
      {shownAlert && (
        <span className={cn("min-w-0 truncate", TONE_CLASSES[shownAlert.tone])}>{shownAlert.message}</span>
      )}
      <span className="ml-auto shrink-0 text-text-muted">{`Ln ${line}, Col ${column}`}</span>
    </div>
  );
}
