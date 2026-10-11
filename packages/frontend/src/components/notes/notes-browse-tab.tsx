import { useCallback, useMemo } from "react";
import { FilePlus, FolderInput, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { ENTITY_TYPE, NOTE_NAME_MAX_LENGTH, type NoteMetadata } from "@crow-central-agency/shared";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useOpenNoteMoveDialog } from "../../hooks/dialogs/use-open-note-move-dialog.js";
import { usePromptDialog } from "../../hooks/dialogs/use-prompt-dialog.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { Tree } from "../common/tree/tree.js";
import type { TreeNodeAction } from "../common/tree/tree.types.js";
import { NOTES_ROOT_LABEL } from "./note-tree-nodes.js";
import { NotesTreeStatus } from "./notes-tree-status.js";
import { useNoteTreeNodes } from "./use-note-tree-nodes.js";

/**
 * The live notes tree and everything done to live notes. Name validation and
 * conflicts are decided by the backend; the dialogs render what it says. A
 * created or renamed note is selected once saved.
 */
export function NotesBrowseTab() {
  const { getNote, getChildIds, getListStatus, createNote, createFolder, updateNote, deleteNote } = useNotesContext();
  const nodes = useNoteTreeNodes({ isTrashed: false });
  const prompt = usePromptDialog();
  const confirm = useConfirmDialog();
  const openMoveDialog = useOpenNoteMoveDialog();
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const { isLoading, error } = getListStatus(false);
  const isEmpty = getChildIds(undefined, false).length === 0;

  // New notes land in the selected folder, or beside the selected note.
  const targetFolder = useMemo(() => {
    const selectedNote = selectedNoteId ? getNote(selectedNoteId) : undefined;
    if (selectedNote?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      return selectedNote;
    }

    return selectedNote?.parentId ? getNote(selectedNote.parentId) : undefined;
  }, [getNote, selectedNoteId]);

  const targetName = targetFolder?.name ?? NOTES_ROOT_LABEL;

  const handleCreateNote = useCallback(() => {
    prompt({
      title: "New Note",
      label: "Note name",
      maxLength: NOTE_NAME_MAX_LENGTH,
      confirmLabel: "Create",
      onConfirm: async (name) => selectNote(await createNote(name, targetFolder?.id)),
    });
  }, [prompt, createNote, targetFolder, selectNote]);

  const handleCreateFolder = useCallback(() => {
    prompt({
      title: "New Folder",
      label: "Folder name",
      maxLength: NOTE_NAME_MAX_LENGTH,
      confirmLabel: "Create",
      onConfirm: async (name) => selectNote(await createFolder(name, targetFolder?.id)),
    });
  }, [prompt, createFolder, targetFolder, selectNote]);

  const handleRename = useCallback(
    (noteId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      prompt({
        title: "Rename",
        label: "Name",
        initialValue: metadata.name,
        maxLength: NOTE_NAME_MAX_LENGTH,
        confirmLabel: "Rename",
        onConfirm: async (name) => selectNote(await updateNote(noteId, { name })),
      });
    },
    [prompt, updateNote, selectNote]
  );

  const handleTrash = useCallback(
    (noteId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      confirm({
        title: "Move to Trash",
        message: `Move "${metadata.name}" to the trash? You can restore it from there.`,
        confirmLabel: "Delete",
        onConfirm: () => deleteNote(noteId),
      });
    },
    [confirm, deleteNote]
  );

  const nodeActions = useMemo<TreeNodeAction<NoteMetadata>[]>(
    () => [
      { id: "rename", label: "Rename", icon: Pencil, onSelect: handleRename },
      { id: "move", label: "Move", icon: FolderInput, onSelect: openMoveDialog },
      { id: "delete", label: "Delete", icon: Trash2, onSelect: handleTrash },
    ],
    [handleRename, openMoveDialog, handleTrash]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-secondary">{targetName}</span>
        <ActionButton
          icon={FilePlus}
          label={`New note in ${targetName}`}
          variant={ACTION_BUTTON_VARIANT.GHOST}
          iconOnly
          onClick={handleCreateNote}
        />
        <ActionButton
          icon={FolderPlus}
          label={`New folder in ${targetName}`}
          variant={ACTION_BUTTON_VARIANT.GHOST}
          iconOnly
          onClick={handleCreateFolder}
        />
      </div>

      <NotesTreeStatus
        isLoading={isLoading}
        error={error}
        isEmpty={isEmpty}
        emptyMessage="No notes yet. Create one to get started."
      >
        <Tree
          nodes={nodes}
          selectedId={selectedNoteId}
          revealId={selectedNoteId}
          actions={nodeActions}
          onSelect={selectNote}
          ariaLabel="Notes"
        />
      </NotesTreeStatus>
    </div>
  );
}
