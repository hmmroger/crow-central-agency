import { useCallback, useMemo } from "react";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { NOTES_ROOT_LABEL } from "./note-tree-nodes.js";

interface NewNote {
  /** Folder a new note lands in; undefined for the root */
  destinationId?: string;
  /** Name of the destination folder, or the root label */
  destinationName: string;
  /** Creates the note without a prompt; resolves with its id and rejects with the backend error */
  createNewNote: () => Promise<string>;
}

const NEW_NOTE_NAME = "New note";

/** `New note`, or the first `New note N` not in `takenNames` (lowercased). */
function getFreeNoteName(takenNames: Set<string>): string {
  let name = NEW_NOTE_NAME;
  for (let suffix = 2; takenNames.has(name.toLowerCase()); suffix++) {
    name = `${NEW_NOTE_NAME} ${suffix}`;
  }

  return name;
}

/**
 * The one rule for creating a note without a name prompt. It lands in the
 * selected folder, or beside the selected note, else at the root, and takes
 * the first default name free among that folder's live notes.
 */
export function useNewNote(): NewNote {
  const { getNote, getChildIds, createNote } = useNotesContext();
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);

  const destinationFolder = useMemo(() => {
    const selectedNote = selectedNoteId ? getNote(selectedNoteId) : undefined;
    if (selectedNote?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      return selectedNote;
    }

    return selectedNote?.parentId ? getNote(selectedNote.parentId) : undefined;
  }, [getNote, selectedNoteId]);

  const destinationId = destinationFolder?.id;

  const createNewNote = useCallback(() => {
    const takenNames = new Set(
      getChildIds(destinationId, false).flatMap((childId) => getNote(childId)?.name.toLowerCase() ?? [])
    );

    return createNote(getFreeNoteName(takenNames), destinationId);
  }, [destinationId, getChildIds, getNote, createNote]);

  return { destinationId, destinationName: destinationFolder?.name ?? NOTES_ROOT_LABEL, createNewNote };
}
