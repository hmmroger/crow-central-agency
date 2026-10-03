import { useCallback, useMemo } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNoteTrashQuery } from "../../hooks/queries/use-note-trash-query.js";
import { useEmptyTrash, useRestoreNote } from "../../hooks/queries/use-note-mutations.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useNoteDeletion } from "../../hooks/dialogs/use-note-deletion.js";
import { NOTES_SIDEBAR_TAB, useAppStore } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { TabBar } from "../common/tab-bar.js";
import type { TreeRowAction } from "../common/tree-view/tree-view.types.js";
import { NoteTree } from "./note-tree.js";
import { NOTES_SIDEBAR_LAYOUT_ID, NOTES_SIDEBAR_TABS } from "./notes-sidebar-tabs.js";

/**
 * The trash, browsed with the same tree as the live notes. Selecting a note
 * previews it read-only; restoring is what makes it editable again.
 */
export function NoteTrashSidebar() {
  const { data: trashedNotes = [], isLoading, error } = useNoteTrashQuery();
  const { mutate: restoreNote, error: restoreError } = useRestoreNote();
  const { mutateAsync: emptyTrash } = useEmptyTrash();
  const confirm = useConfirmDialog();
  const deleteNote = useNoteDeletion();
  const selectedId = useAppStore((state) => state.selectedTrashNoteId);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);
  const setNotesSidebarTab = useAppStore((state) => state.setNotesSidebarTab);

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

  const trashActions = useMemo<TreeRowAction<NoteMetadata>[]>(
    () => [
      { id: "restore", label: "Restore", icon: RotateCcw, onSelect: handleRestore },
      { id: "delete", label: "Delete permanently", icon: Trash2, onSelect: deleteNote },
    ],
    [handleRestore, deleteNote]
  );

  return (
    <div className="flex flex-col gap-1">
      <TabBar
        tabs={NOTES_SIDEBAR_TABS}
        activeTab={NOTES_SIDEBAR_TAB.TRASH}
        onTabChange={setNotesSidebarTab}
        layoutId={NOTES_SIDEBAR_LAYOUT_ID}
        trailing={
          <ActionButton
            label="Empty trash"
            variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
            disabled={trashedNotes.length === 0}
            onClick={handleEmptyTrash}
          />
        }
      />

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
            ariaLabel="Trash"
          />
        ))}
    </div>
  );
}
