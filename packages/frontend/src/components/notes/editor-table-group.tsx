import { TABLE_COMMANDS } from "./editor-commands.js";
import { EditorToolbarButton } from "./editor-toolbar-button.js";
import type { EditorTableGroupProps } from "./editor-toolbar.types.js";

/** Table actions, present only while a table cell is being edited. */
export function EditorTableGroup({ editor, formatState, className }: EditorTableGroupProps) {
  if (!formatState.isInTableCell) {
    return undefined;
  }

  return (
    <div className={className} role="group" aria-label="Table">
      {TABLE_COMMANDS.map((command) => (
        <EditorToolbarButton key={command.label} editor={editor} formatState={formatState} command={command} />
      ))}
    </div>
  );
}
