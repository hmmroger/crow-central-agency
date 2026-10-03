import { useCallback } from "react";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { NoteMoveDialog } from "../../components/notes/note-move-dialog.js";

const NOTE_MOVE_DIALOG_ID = "note-move";

/**
 * Hook to open the note move dialog.
 *
 * @returns A function that opens the dialog for the given note id.
 */
export function useOpenNoteMoveDialog() {
  const { showDialog } = useModalDialog();

  return useCallback(
    (noteId: string) => {
      showDialog({
        id: `${NOTE_MOVE_DIALOG_ID}-${noteId}`,
        title: "Move",
        component: NoteMoveDialog,
        componentProps: { noteId },
        className: "w-96",
      });
    },
    [showDialog]
  );
}
