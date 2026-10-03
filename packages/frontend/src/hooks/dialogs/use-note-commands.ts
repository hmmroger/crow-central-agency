import { useCallback, useMemo } from "react";
import { NOTE_NAME_MAX_LENGTH } from "@crow-central-agency/shared";
import { NoteMoveDialog } from "../../components/notes/note-move-dialog.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { useConfirmDialog } from "./use-confirm-dialog.js";
import { usePromptDialog } from "./use-prompt-dialog.js";

/** Dialog-driven note commands, each taking note ids */
export interface NoteCommands {
  /** Create a text note under `parentId`, or at the root when it is undefined */
  createNote: (parentId: string | undefined) => void;
  /** Create a folder under `parentId`, or at the root when it is undefined */
  createFolder: (parentId: string | undefined) => void;
  renameNote: (noteId: string) => void;
  moveNote: (noteId: string) => void;
  /** Move a live note to the trash, or remove a trashed one for good */
  deleteNote: (noteId: string) => void;
  restoreNote: (noteId: string) => void;
  emptyTrash: () => void;
}

/** Confirmation wording for one of the two outcomes of a delete */
interface DeleteConfirmCopy {
  title: string;
  confirmLabel: string;
  isDestructive: boolean;
  getMessage: (name: string) => string;
}

const MOVE_DIALOG_ID = "note-move";

const TRASHED_COPY: DeleteConfirmCopy = {
  title: "Delete Permanently",
  confirmLabel: "Delete permanently",
  isDestructive: true,
  getMessage: (name) => `Permanently delete "${name}"? This cannot be undone.`,
};

const LIVE_COPY: DeleteConfirmCopy = {
  title: "Move to Trash",
  confirmLabel: "Delete",
  isDestructive: false,
  getMessage: (name) => `Move "${name}" to the trash? You can restore it from there.`,
};

/**
 * The prompts and confirmations behind every note command. Name validation and
 * conflicts are decided by the backend; the dialogs render what it says. A
 * created, renamed or moved note is selected once it is saved.
 */
export function useNoteCommands(): NoteCommands {
  const prompt = usePromptDialog();
  const confirm = useConfirmDialog();
  const { showDialog } = useModalDialog();
  const notes = useNotesContext();
  const selectNote = useAppStore((state) => state.selectNote);

  const createNote = useCallback(
    (parentId: string | undefined) => {
      prompt({
        title: "New Note",
        label: "Note name",
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Create",
        onConfirm: async (name) => selectNote(await notes.createNote(parentId, name)),
      });
    },
    [prompt, notes, selectNote]
  );

  const createFolder = useCallback(
    (parentId: string | undefined) => {
      prompt({
        title: "New Folder",
        label: "Folder name",
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Create",
        onConfirm: async (name) => selectNote(await notes.createFolder(parentId, name)),
      });
    },
    [prompt, notes, selectNote]
  );

  const renameNote = useCallback(
    (noteId: string) => {
      const metadata = notes.getNote(noteId);
      if (!metadata) {
        return;
      }

      prompt({
        title: "Rename",
        label: "Name",
        initialValue: metadata.name,
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Rename",
        onConfirm: async (name) => selectNote(await notes.updateNote(noteId, { name })),
      });
    },
    [prompt, notes, selectNote]
  );

  const moveNote = useCallback(
    (noteId: string) => {
      showDialog({
        id: MOVE_DIALOG_ID,
        title: "Move",
        component: NoteMoveDialog,
        componentProps: { noteId, onMoved: selectNote },
        className: "w-96",
      });
    },
    [showDialog, selectNote]
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      const metadata = notes.getNote(noteId);
      if (!metadata) {
        return;
      }

      const copy = metadata.isTrashed ? TRASHED_COPY : LIVE_COPY;
      confirm({
        title: copy.title,
        message: copy.getMessage(metadata.name),
        confirmLabel: copy.confirmLabel,
        destructive: copy.isDestructive,
        onConfirm: () => notes.deleteNote(noteId),
      });
    },
    [confirm, notes]
  );

  const restoreNote = useCallback(
    (noteId: string) => {
      const metadata = notes.getNote(noteId);
      if (!metadata) {
        return;
      }

      confirm({
        title: "Restore",
        message: `Restore "${metadata.name}" to where it was deleted from?`,
        confirmLabel: "Restore",
        onConfirm: async () => {
          await notes.restoreNote(noteId);
        },
      });
    },
    [confirm, notes]
  );

  const emptyTrash = useCallback(() => {
    confirm({
      title: "Empty Trash",
      message: "Permanently delete everything in the trash? This cannot be undone.",
      confirmLabel: "Empty trash",
      destructive: true,
      onConfirm: notes.emptyTrash,
    });
  }, [confirm, notes]);

  return useMemo(
    () => ({ createNote, createFolder, renameNote, moveNote, deleteNote, restoreNote, emptyTrash }),
    [createNote, createFolder, renameNote, moveNote, deleteNote, restoreNote, emptyTrash]
  );
}
