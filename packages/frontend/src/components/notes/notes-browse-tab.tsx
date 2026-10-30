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
import type { TreeDragDrop, TreeNodeAction, TreeNodeRef } from "../common/tree/tree.types.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { NOTES_ROOT_NODE_ID } from "./note-tree-nodes.js";
import { NotesTreeStatus } from "./notes-tree-status.js";
import { useNewNote } from "./use-new-note.js";
import { useNoteTreeNodes } from "./use-note-tree-nodes.js";

const DEFAULT_EXPANDED_IDS = [NOTES_ROOT_NODE_ID];

function isNoteNode(nodeId: string): boolean {
  return nodeId !== NOTES_ROOT_NODE_ID;
}

function isFolderTarget(target: TreeNodeRef<NoteMetadata>): boolean {
  return target.id === NOTES_ROOT_NODE_ID || target.data?.entityType === ENTITY_TYPE.NOTE_FOLDER;
}

/**
 * The live notes tree and everything done to live notes. Name validation and
 * conflicts are decided by the backend; the dialogs render what it says. A new
 * note takes the first free default name without a prompt. A created or renamed
 * note is selected once saved.
 */
export function NotesBrowseTab() {
  const { getChildIds, getListStatus, createFolder, updateNote, deleteNote } = useNotesContext();
  const nodes = useNoteTreeNodes({ isTrashed: false, hasRoot: true });
  const { destinationId, destinationName, createNewNote } = useNewNote();
  const prompt = usePromptDialog();
  const confirm = useConfirmDialog();
  const openMoveDialog = useOpenNoteMoveDialog();
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const { isLoading, error } = getListStatus(false);
  const isEmpty = getChildIds(undefined, false).length === 0;

  const selectedNodeId = selectedNoteId ?? NOTES_ROOT_NODE_ID;

  const handleSelect = useCallback(
    (nodeId: string) => selectNote(nodeId === NOTES_ROOT_NODE_ID ? undefined : nodeId),
    [selectNote]
  );

  const handleCreateNote = useCallback(async () => {
    try {
      selectNote(await createNewNote());
    } catch (createError) {
      confirm({
        title: "Create failed",
        message: getErrorMessage(createError),
        confirmLabel: "OK",
        confirmOnly: true,
        onConfirm: () => undefined,
      });
    }
  }, [createNewNote, selectNote, confirm]);

  const handleCreateFolder = useCallback(() => {
    prompt({
      title: "New Folder",
      label: "Folder name",
      maxLength: NOTE_NAME_MAX_LENGTH,
      confirmLabel: "Create",
      onConfirm: async (name) => selectNote(await createFolder(name, destinationId)),
    });
  }, [prompt, createFolder, destinationId, selectNote]);

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

  const handleDrop = useCallback(
    async (source: TreeNodeRef<NoteMetadata>, target: TreeNodeRef<NoteMetadata>) => {
      try {
        selectNote(await updateNote(source.id, { parentId: target.data?.id ?? null }));
      } catch (moveError) {
        confirm({
          title: "Move failed",
          message: getErrorMessage(moveError),
          confirmLabel: "OK",
          confirmOnly: true,
          onConfirm: () => undefined,
        });
      }
    },
    [updateNote, selectNote, confirm]
  );

  const dragDrop = useMemo<TreeDragDrop<NoteMetadata>>(
    () => ({
      canDrag: (node) => isNoteNode(node.id),
      canDrop: (source, target) => isFolderTarget(target) && target.data?.id !== source.data?.parentId,
      onDrop: handleDrop,
      isLeafRedirected: true,
    }),
    [handleDrop]
  );

  const nodeActions = useMemo<TreeNodeAction<NoteMetadata>[]>(
    () => [
      { id: "rename", label: "Rename", icon: Pencil, isAvailable: isNoteNode, onSelect: handleRename },
      { id: "move", label: "Move", icon: FolderInput, isAvailable: isNoteNode, onSelect: openMoveDialog },
      { id: "delete", label: "Delete", icon: Trash2, isAvailable: isNoteNode, onSelect: handleTrash },
    ],
    [handleRename, openMoveDialog, handleTrash]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-secondary">{destinationName}</span>
        <ActionButton
          icon={FilePlus}
          label={`New note in ${destinationName}`}
          variant={ACTION_BUTTON_VARIANT.GHOST}
          iconOnly
          onClick={handleCreateNote}
        />
        <ActionButton
          icon={FolderPlus}
          label={`New folder in ${destinationName}`}
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
          selectedId={selectedNodeId}
          revealId={selectedNoteId}
          defaultExpandedIds={DEFAULT_EXPANDED_IDS}
          actions={nodeActions}
          dragDrop={dragDrop}
          onSelect={handleSelect}
          ariaLabel="Notes"
        />
      </NotesTreeStatus>
    </div>
  );
}
