import { isTableCellActive } from "./editor/extensions/table-cell-state.js";
import { useEditorSelector } from "./editor/use-editor-selector.js";
import { TABLE_COMMANDS } from "./editor-commands.js";
import { EditorToolbarButton } from "./editor-toolbar-button.js";
import type { EditorTableGroupProps } from "./editor-toolbar.types.js";

/** Table actions, present only while a table cell is being edited. */
export function EditorTableGroup({ editor, className }: EditorTableGroupProps) {
  const isVisible = useEditorSelector(editor, isTableCellActive);

  if (!isVisible) {
    return undefined;
  }

  return (
    <div className={className} role="group" aria-label="Table">
      {TABLE_COMMANDS.map((command) => (
        <EditorToolbarButton key={command.label} editor={editor} command={command} />
      ))}
    </div>
  );
}
