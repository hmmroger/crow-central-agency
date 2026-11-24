import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE } from "@crow-central-agency/shared";
import { FindBar } from "../common/find/find-bar.js";
import { useFind } from "../common/find/use-find.js";
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
const EDITOR_SURFACE_KEY = "editor";
const READER_SURFACE_KEY = "reader";

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
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const editorRef = useRef<NoteEditorHandle>(null);
  const note = noteId ? getNote(noteId) : undefined;
  const isTextNote = note?.entityType === ENTITY_TYPE.NOTE && note.contentType === NOTE_CONTENT_TYPE.TEXT;
  const isEditing = note?.entityType === ENTITY_TYPE.NOTE && !note.isReadOnly && !isNoteReadMode;
  const find = useFind(isTextNote, isEditing ? EDITOR_SURFACE_KEY : READER_SURFACE_KEY);
  const { isQueryFocused } = find;
  // A reload while the user types a query must not move their keystrokes into the note.
  const shouldEditorFocusOnMount = useCallback(() => !isQueryFocused(), [isQueryFocused]);

  // Saved content never reaches the content cache, so the draft is written
  // before the editor goes, and the cached entry is dropped so whichever
  // surface mounts next fetches what was last saved. The toggle stays disabled
  // until the flush settles, so a second click can't act on a stale mode.
  const handleReadModeToggle = useCallback(() => {
    if (noteId === undefined) {
      return;
    }

    const flushed = !isNoteReadMode && editorRef.current ? editorRef.current.flush() : Promise.resolve(true);
    setIsSwitchingMode(true);

    void flushed.then((isFlushed) => {
      setIsSwitchingMode(false);
      if (isFlushed) {
        queryClient.removeQueries({ queryKey: noteKeys.content(noteId) });
        setNoteReadMode(!isNoteReadMode);
      }
    });
  }, [noteId, isNoteReadMode, queryClient, setNoteReadMode]);

  if (note?.entityType !== ENTITY_TYPE.NOTE) {
    return <EmptyState message={SELECT_HINT} />;
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <NoteHeader
        note={note}
        isUnsaved={isUnsaved}
        readModeToggle={
          note.isReadOnly
            ? undefined
            : { isReadMode: isNoteReadMode, isSwitching: isSwitchingMode, onToggle: handleReadModeToggle }
        }
      />

      {find.isOpen && (
        <FindBar
          inputRef={find.inputRef}
          query={find.query}
          isCaseSensitive={find.isCaseSensitive}
          result={find.result}
          onQueryChange={find.setQuery}
          onCaseSensitiveToggle={find.toggleCaseSensitive}
          onNext={find.next}
          onPrevious={find.previous}
          onClose={find.close}
        />
      )}

      <div className="flex-1 min-h-0">
        {isEditing ? (
          <NoteEditor
            ref={editorRef}
            note={note}
            onUnsavedChange={setIsUnsaved}
            findRef={find.surfaceRef}
            onFindResult={find.onResult}
            shouldFocusOnMount={shouldEditorFocusOnMount}
          />
        ) : (
          <NoteReader note={note} findRef={find.surfaceRef} onFindResult={find.onResult} />
        )}
      </div>
    </div>
  );
}
