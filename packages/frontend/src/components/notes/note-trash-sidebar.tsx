import { useCallback, useMemo } from "react";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNoteTrashQuery } from "../../hooks/queries/use-note-trash-query.js";
import { useEmptyTrash, useRestoreNote } from "../../hooks/queries/use-note-mutations.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useNoteDeletion } from "../../hooks/dialogs/use-note-deletion.js";
import { useAppStore } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { ActionButton } from "../common/action-button.js";
import { NoteTree } from "./note-tree.js";
import type { NoteTreeAction } from "./note-tree.types.js";

interface NoteTrashSidebarProps {
  /** Return to the live note tree */
  onClose: () => void;
}

/**
 * The trash, browsed with the same tree as the live notes. Selecting a note
 * previews it read-only; restoring is what makes it editable again.
 */
export function NoteTrashSidebar({ onClose }: NoteTrashSidebarProps) {
  const { data: trashedNotes = [], isLoading, error } = useNoteTrashQuery();
  const { mutate: restoreNote, error: restoreError } = useRestoreNote();
  const { mutateAsync: emptyTrash } = useEmptyTrash();
  const confirm = useConfirmDialog();
  const deleteNote = useNoteDeletion();
  const selectedId = useAppStore((state) => state.selectedTrashNoteId);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);

  const handleSelect = useCallback(
    (metadata: NoteMetadata) => {
      selectTrashNote(metadata.id);
    },
    [selectTrashNote]
  );

  const handleRestore = useCallback(
    (metadata: NoteMetadata) => {
      restoreNote(metadata.id, {
        onSuccess: () => {
          // The note is live again, so nothing in this pane answers to its id.
          // The selection is read on success, since it can move while the
          // restore is in flight.
          if (metadata.id === useAppStore.getState().selectedTrashNoteId) {
            selectTrashNote(undefined);
          }
        },
      });
    },
    [restoreNote, selectTrashNote]
  );

  const handleEmptyTrash = useCallback(() => {
    confirm({
      title: "Empty Trash",
      message: "Permanently delete everything in the trash? This cannot be undone.",
      confirmLabel: "Empty trash",
      destructive: true,
      onConfirm: async () => {
        await emptyTrash();
        selectTrashNote(undefined);
      },
    });
  }, [confirm, emptyTrash, selectTrashNote]);

  const trashActions = useMemo<NoteTreeAction[]>(
    () => [
      { id: "restore", label: "Restore", icon: RotateCcw, onSelect: handleRestore },
      { id: "delete", label: "Delete permanently", icon: Trash2, onSelect: deleteNote },
    ],
    [handleRestore, deleteNote]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1 px-1 pb-1">
        <span className="min-w-0 truncate text-3xs uppercase tracking-wide text-text-muted">Trash</span>
        <div className="flex shrink-0 gap-1">
          <ActionButton icon={ArrowLeft} label="Back to notes" iconOnly onClick={onClose} />
          <ActionButton
            icon={Trash2}
            label="Empty trash"
            iconOnly
            disabled={trashedNotes.length === 0}
            onClick={handleEmptyTrash}
          />
        </div>
      </div>

      {error && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(error)}</p>}
      {restoreError && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(restoreError)}</p>}

      {isLoading && <p className="px-2 py-1 text-xs text-text-muted">Loading...</p>}

      {!isLoading &&
        (trashedNotes.length === 0 ? (
          <p className="px-2 py-1 text-xs text-text-muted">The trash is empty.</p>
        ) : (
          <NoteTree
            notes={trashedNotes}
            selectedId={selectedId}
            revealId={selectedId}
            actions={trashActions}
            onSelect={handleSelect}
          />
        ))}
    </div>
  );
}
