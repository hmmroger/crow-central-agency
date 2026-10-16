import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { noteKeys } from "../../services/query-keys.js";
import { useAppStore } from "../../stores/app-store.js";
import { EmptyState } from "../common/empty-state.js";
import type { NoteEditorHandle } from "./note-editor.types.js";
import { NoteHeader } from "./note-header.js";
import { NoteReader } from "./note-reader.js";
import { NoteEditor } from "./note-editor.js";

interface NoteWorkspaceProps {
  noteId?: string;
}

const SELECT_HINT = "Select a note to read it.";

/**
 * The open note: its header above the surface it opens on — the reader for a
 * read-only note, a trashed one included, since deleting a note revokes editing,
 * not reading; for an editable note, the editor or the reader as the read-mode
 * preference says. Remounted per note by the caller, so the unsaved marker
 * never outlives the note it belongs to.
 */
export function NoteWorkspace({ noteId }: NoteWorkspaceProps) {
  const { getNote } = useNotesContext();
  const queryClient = useQueryClient();
  const isNoteReadMode = useAppStore((state) => state.isNoteReadMode);
  const setNoteReadMode = useAppStore((state) => state.setNoteReadMode);
  const [isUnsaved, setIsUnsaved] = useState(false);
  const editorRef = useRef<NoteEditorHandle>(null);
  const note = noteId ? getNote(noteId) : undefined;

  // Saved content never reaches the content cache, so the draft is written
  // before the editor goes, and the cached entry is dropped so whichever
  // surface mounts next fetches what was last saved.
  const handleReadModeToggle = useCallback(async () => {
    if (noteId === undefined) {
      return;
    }

    if (!isNoteReadMode && editorRef.current && !(await editorRef.current.flush())) {
      return;
    }

    queryClient.removeQueries({ queryKey: noteKeys.content(noteId) });
    setNoteReadMode(!isNoteReadMode);
  }, [noteId, isNoteReadMode, queryClient, setNoteReadMode]);

  if (note?.entityType !== ENTITY_TYPE.NOTE) {
    return <EmptyState message={SELECT_HINT} />;
  }

  const isEditing = !note.isReadOnly && !isNoteReadMode;

  return (
    <div className="h-full flex flex-col min-h-0">
      <NoteHeader
        note={note}
        isUnsaved={isUnsaved}
        readModeToggle={
          note.isReadOnly ? undefined : { isReadMode: isNoteReadMode, onToggle: () => void handleReadModeToggle() }
        }
      />

      <div className="flex-1 min-h-0">
        {isEditing ? (
          <NoteEditor ref={editorRef} note={note} onUnsavedChange={setIsUnsaved} />
        ) : (
          <NoteReader note={note} />
        )}
      </div>
    </div>
  );
}
