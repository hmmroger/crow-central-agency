import { useCallback, useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { Tree } from "../common/tree/tree.js";
import type { TreeNodeAction } from "../common/tree/tree.types.js";
import { buildNoteNodes } from "./note-tree-nodes.js";

const STATUS_CLASS = "px-2 py-1 text-xs text-text-muted";

/** The trash tree: trashed notes preview read-only and can be restored or deleted for good. */
export function NotesTrashTab() {
  const { getNote, getChildIds, getListStatus, deleteNote, restoreNote, emptyTrash } = useNotesContext();
  const confirm = useConfirmDialog();
  const selectedTrashNoteId = useAppStore((state) => state.selectedTrashNoteId);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);
  const { isLoading, error } = getListStatus(true);
  const itemCount = getChildIds(undefined, true).length;
  const isEmpty = itemCount === 0;
  const nodes = useMemo(() => buildNoteNodes({ getNote, getChildIds }, undefined, true), [getNote, getChildIds]);

  const handleRestore = useCallback(
    (noteId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      confirm({
        title: "Restore",
        message: `Restore "${metadata.name}" to where it was deleted from?`,
        confirmLabel: "Restore",
        onConfirm: async () => {
          await restoreNote(noteId);
        },
      });
    },
    [confirm, restoreNote]
  );

  const handleDeletePermanently = useCallback(
    (noteId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      confirm({
        title: "Delete Permanently",
        message: `Permanently delete "${metadata.name}"? This cannot be undone.`,
        confirmLabel: "Delete permanently",
        destructive: true,
        onConfirm: () => deleteNote(noteId),
      });
    },
    [confirm, deleteNote]
  );

  const handleEmptyTrash = useCallback(() => {
    confirm({
      title: "Empty Trash",
      message: "Permanently delete everything in the trash? This cannot be undone.",
      confirmLabel: "Empty trash",
      destructive: true,
      onConfirm: emptyTrash,
    });
  }, [confirm, emptyTrash]);

  const nodeActions = useMemo<TreeNodeAction<NoteMetadata>[]>(
    () => [
      { id: "restore", label: "Restore", icon: RotateCcw, onSelect: handleRestore },
      { id: "delete", label: "Delete permanently", icon: Trash2, onSelect: handleDeletePermanently },
    ],
    [handleRestore, handleDeletePermanently]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">
          {`${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        </span>
        <ActionButton
          icon={Trash2}
          label="Empty trash"
          variant={ACTION_BUTTON_VARIANT.GHOST}
          iconOnly
          disabled={isEmpty}
          onClick={handleEmptyTrash}
          className="hover:text-error"
        />
      </div>

      {error && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(error)}</p>}

      {isLoading ? (
        <p className={STATUS_CLASS}>Loading...</p>
      ) : isEmpty ? (
        <p className={STATUS_CLASS}>The trash is empty.</p>
      ) : (
        <Tree
          nodes={nodes}
          selectedId={selectedTrashNoteId}
          revealId={selectedTrashNoteId}
          actions={nodeActions}
          onSelect={selectTrashNote}
          ariaLabel="Trash"
        />
      )}
    </div>
  );
}
