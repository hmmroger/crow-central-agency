import { useCallback } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useConfirmDialog } from "./use-confirm-dialog.js";
import { useDeleteNote } from "../queries/use-note-mutations.js";
import { useAppStore } from "../../stores/app-store.js";

/** Confirmation wording for one of the two outcomes of a delete */
interface DeleteConfirmCopy {
  title: string;
  confirmLabel: string;
  isDestructive: boolean;
  getMessage: (name: string) => string;
}

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
 * Delete a note after confirming it. The backend deletes by location — a live
 * note moves to the trash, a trashed one is removed for good — so where the
 * note lives changes only what the dialog says.
 */
export function useNoteDeletion(): (metadata: NoteMetadata) => void {
  const confirm = useConfirmDialog();
  const { mutateAsync: deleteNoteById } = useDeleteNote();
  return useCallback(
    (metadata: NoteMetadata) => {
      const copy = metadata.isTrashed ? TRASHED_COPY : LIVE_COPY;

      confirm({
        title: copy.title,
        message: copy.getMessage(metadata.name),
        confirmLabel: copy.confirmLabel,
        destructive: copy.isDestructive,
        onConfirm: async () => {
          await deleteNoteById(metadata.id);

          // A deleted note leaves the pane it was selected in, so the
          // selection goes with it instead of lingering as an id that no
          // longer resolves. The selection is read here, not when the dialog
          // opened, since it can move while the dialog is up.
          const { selectedNoteId, selectedTrashNoteId, selectNote, selectTrashNote } = useAppStore.getState();

          if (metadata.id === selectedNoteId) {
            selectNote(undefined);
          }

          if (metadata.id === selectedTrashNoteId) {
            selectTrashNote(undefined);
          }
        },
      });
    },
    [confirm, deleteNoteById]
  );
}
