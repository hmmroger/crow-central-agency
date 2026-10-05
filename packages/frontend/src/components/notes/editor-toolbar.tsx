import type { MouseEvent } from "react";
import { BLOCK_COMMANDS, BLOCK_TYPE_COMMANDS, LIST_COMMANDS, MARK_COMMANDS } from "./editor-commands.js";
import { EditorLinkButton } from "./editor-link-button.js";
import { EditorTableGroup } from "./editor-table-group.js";
import { EditorToolbarButton } from "./editor-toolbar-button.js";
import type { EditorCommandGroup, EditorToolbarProps } from "./editor-toolbar.types.js";

const COMMAND_GROUPS: EditorCommandGroup[] = [
  { name: "Block type", commands: BLOCK_TYPE_COMMANDS },
  { name: "Text style", commands: MARK_COMMANDS },
  { name: "Lists", commands: LIST_COMMANDS },
  { name: "Blocks", commands: BLOCK_COMMANDS },
];

const GROUP_CLASS =
  "flex flex-wrap items-center gap-1 border-l border-border-subtle pl-1.5 first:border-l-0 first:pl-0";

/** A pressed button would take focus from an active table cell and end its edit before the command runs. */
function keepEditorFocus(event: MouseEvent): void {
  event.preventDefault();
}

/** Always-visible formatting controls above the note canvas. */
export function EditorToolbar({ editor, formatState }: EditorToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      onMouseDown={keepEditorFocus}
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-border-subtle bg-surface-secondary p-1.5"
    >
      {COMMAND_GROUPS.map((group) => (
        <div key={group.name} className={GROUP_CLASS} role="group" aria-label={group.name}>
          {group.commands.map((command) => (
            <EditorToolbarButton key={command.label} editor={editor} formatState={formatState} command={command} />
          ))}
        </div>
      ))}

      <div className={GROUP_CLASS} role="group" aria-label="Link">
        <EditorLinkButton editor={editor} formatState={formatState} />
      </div>

      <EditorTableGroup editor={editor} formatState={formatState} className={GROUP_CLASS} />
    </div>
  );
}
