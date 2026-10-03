import { useState } from "react";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { EmptyState } from "../common/empty-state.js";
import { NoteHeader } from "./note-header.js";
import { NoteReader } from "./note-reader.js";
import { NoteEditor } from "./note-editor.js";

interface NoteWorkspaceProps {
  /** Currently selected note, if any */
  note?: NoteMetadata;
}

const SELECT_HINT = "Select a note to read it.";

/**
 * The open note: its header above the surface it opens on — the editor for a
 * live text note, the reader for a read-only one, a trashed note included,
 * since deleting a note revokes editing, not reading. Remounted per note by the
 * caller, so the unsaved marker never outlives the note it belongs to.
 */
export function NoteWorkspace({ note }: NoteWorkspaceProps) {
  const [isUnsaved, setIsUnsaved] = useState(false);

  if (note?.entityType !== ENTITY_TYPE.NOTE) {
    return <EmptyState message={SELECT_HINT} />;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <NoteHeader note={note} isUnsaved={isUnsaved} />

      <div className="flex-1 min-h-0">
        {note.isReadOnly ? <NoteReader note={note} /> : <NoteEditor note={note} onUnsavedChange={setIsUnsaved} />}
      </div>
    </div>
  );
}
