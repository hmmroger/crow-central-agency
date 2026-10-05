import { cn } from "../../utils/cn.js";
import { EDITOR_STATUS_TONE, type EditorStatusBarProps, type EditorStatusTone } from "./editor-status-bar.types.js";

const TONE_CLASSES: Record<EditorStatusTone, string> = {
  [EDITOR_STATUS_TONE.WARNING]: "text-warning",
  [EDITOR_STATUS_TONE.ERROR]: "text-error",
};

/** Cursor position in the markdown source, plus any alert the last write or editor action raised. */
export function EditorStatusBar({ status, alert }: EditorStatusBarProps) {
  const shownAlert =
    alert ?? (status.error === undefined ? undefined : { message: status.error, tone: EDITOR_STATUS_TONE.ERROR });

  return (
    <div className="flex items-center gap-2 border-t border-border-subtle px-2 py-2 text-xs">
      {shownAlert && (
        <span className={cn("min-w-0 truncate", TONE_CLASSES[shownAlert.tone])}>{shownAlert.message}</span>
      )}
      <span className="ml-auto shrink-0 text-text-muted">{`Ln ${status.line}, Col ${status.column}`}</span>
    </div>
  );
}
