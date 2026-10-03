import { useCallback } from "react";
import { ActionButton } from "../common/action-button.js";
import type { EditorToolbarButtonProps } from "./editor-toolbar.types.js";

/** One formatting control. */
export function EditorToolbarButton({ editor, formatState, command }: EditorToolbarButtonProps) {
  const handleClick = useCallback(() => {
    command.run(editor);
  }, [command, editor]);

  return (
    <ActionButton
      icon={command.icon}
      label={command.label}
      variant={command.variant}
      iconOnly
      isActive={command.isActive(formatState)}
      disabled={!command.canRun(formatState)}
      onClick={handleClick}
    />
  );
}
