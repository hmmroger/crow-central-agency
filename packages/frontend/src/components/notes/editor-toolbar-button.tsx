import { useCallback } from "react";
import { ActionButton } from "../common/action-button.js";
import { focusEditor } from "./editor/extensions/table-widget.js";
import { useEditorSelector } from "./editor/use-editor-selector.js";
import type { EditorToolbarButtonProps } from "./editor-toolbar.types.js";

/**
 * One formatting control. Subscribing per button keeps a selection change from
 * re-rendering the editor canvas alongside the toolbar.
 */
export function EditorToolbarButton({ editor, command }: EditorToolbarButtonProps) {
  const isActive = useEditorSelector(editor, command.isActive);
  const canRun = useEditorSelector(editor, command.canRun);

  const handleClick = useCallback(() => {
    command.run(editor.view);
    focusEditor(editor.view);
  }, [command, editor]);

  return (
    <ActionButton
      icon={command.icon}
      label={command.label}
      variant={command.variant}
      iconOnly
      isActive={isActive}
      disabled={!canRun}
      onClick={handleClick}
    />
  );
}
