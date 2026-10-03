import { useCallback, useMemo } from "react";
import { ENTITY_TYPE, NOTE_NAME_MAX_LENGTH, type NoteMetadata } from "@crow-central-agency/shared";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { usePromptDialog } from "./use-prompt-dialog.js";
import { useNoteDeletion } from "./use-note-deletion.js";
import { useCreateNote, useUpdateNote } from "../queries/use-note-mutations.js";
import { NoteMoveDialog } from "../../components/notes/note-move-dialog.js";

/** Authoring entry points for the notes tree */
export interface NoteAuthoring {
  /** Create a folder under `parentId`, or at the root when omitted */
  createFolder: (parentId?: string) => void;
  /** Create an empty text note under `parentId`, or at the root when omitted */
  createNote: (parentId?: string) => void;
  renameNote: (metadata: NoteMetadata) => void;
  moveNote: (metadata: NoteMetadata) => void;
  /** Delete a note, cascading through a folder's contents */
  deleteNote: (metadata: NoteMetadata) => void;
}

const MOVE_DIALOG_ID = "note-move";

/**
 * Create / rename / move for notes, each driven by a dialog. Name validation
 * and conflicts are decided by the backend; the dialogs render what it says.
 *
 * @param onNoteSaved called with the created or updated note, so the caller can follow it
 */
export function useNoteAuthoring(onNoteSaved: (metadata: NoteMetadata) => void): NoteAuthoring {
  const prompt = usePromptDialog();
  const { showDialog } = useModalDialog();
  const { mutateAsync: createNote } = useCreateNote();
  const { mutateAsync: updateNote } = useUpdateNote();
  const deleteNote = useNoteDeletion();

  const createFolder = useCallback(
    (parentId?: string) => {
      prompt({
        title: "New Folder",
        label: "Folder name",
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Create",
        onConfirm: async (name) => {
          onNoteSaved(await createNote({ parentId, name, entityType: ENTITY_TYPE.NOTE_FOLDER }));
        },
      });
    },
    [prompt, createNote, onNoteSaved]
  );

  const createTextNote = useCallback(
    (parentId?: string) => {
      prompt({
        title: "New Note",
        label: "Note name",
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Create",
        onConfirm: async (name) => {
          onNoteSaved(await createNote({ parentId, name, entityType: ENTITY_TYPE.NOTE }));
        },
      });
    },
    [prompt, createNote, onNoteSaved]
  );

  const renameNote = useCallback(
    (metadata: NoteMetadata) => {
      prompt({
        title: "Rename",
        label: "Name",
        initialValue: metadata.name,
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Rename",
        onConfirm: async (name) => {
          onNoteSaved(await updateNote({ noteId: metadata.id, input: { name } }));
        },
      });
    },
    [prompt, updateNote, onNoteSaved]
  );

  const moveNote = useCallback(
    (metadata: NoteMetadata) => {
      showDialog({
        id: MOVE_DIALOG_ID,
        title: "Move",
        component: NoteMoveDialog,
        componentProps: { note: metadata, onMoved: onNoteSaved },
        className: "w-96",
      });
    },
    [showDialog, onNoteSaved]
  );

  return useMemo(
    () => ({ createFolder, createNote: createTextNote, renameNote, moveNote, deleteNote }),
    [createFolder, createTextNote, renameNote, moveNote, deleteNote]
  );
}
