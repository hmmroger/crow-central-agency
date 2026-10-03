import { useCallback, useMemo } from "react";
import { FolderInput, Pencil, Trash2 } from "lucide-react";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { useNoteAuthoring } from "../../hooks/dialogs/use-note-authoring.js";
import { NoteTree } from "./note-tree.js";
import { NoteTreeToolbar } from "./note-tree-toolbar.js";
import type { NoteTreeAction } from "./note-tree.types.js";

interface NoteBrowseSidebarProps {
  /** Flat live note tree as served by the backend */
  notes: NoteMetadata[];
  selectedId?: string;
  onSelect: (metadata: NoteMetadata) => void;
  onOpenTrash: () => void;
}

const ROOT_FOLDER_NAME = "Notes";

/** The live note tree with its create, rename, move and delete affordances. */
export function NoteBrowseSidebar({ notes, selectedId, onSelect, onOpenTrash }: NoteBrowseSidebarProps) {
  const { createFolder, createNote, renameNote, moveNote, deleteNote } = useNoteAuthoring(onSelect);
  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);

  // New notes land in the selected folder, or alongside the selected note.
  const targetFolder = useMemo(() => {
    if (selectedNote === undefined) {
      return undefined;
    }

    return selectedNote.entityType === ENTITY_TYPE.NOTE_FOLDER
      ? selectedNote
      : notes.find((note) => note.id === selectedNote.parentId);
  }, [notes, selectedNote]);

  const handleCreateFolder = useCallback(() => createFolder(targetFolder?.id), [createFolder, targetFolder]);
  const handleCreateNote = useCallback(() => createNote(targetFolder?.id), [createNote, targetFolder]);

  const treeActions = useMemo<NoteTreeAction[]>(
    () => [
      { id: "rename", label: "Rename", icon: Pencil, onSelect: renameNote },
      { id: "move", label: "Move", icon: FolderInput, onSelect: moveNote },
      { id: "delete", label: "Delete", icon: Trash2, onSelect: deleteNote },
    ],
    [renameNote, moveNote, deleteNote]
  );

  return (
    <div className="flex flex-col gap-1">
      <NoteTreeToolbar
        targetName={targetFolder?.name ?? ROOT_FOLDER_NAME}
        onCreateNote={handleCreateNote}
        onCreateFolder={handleCreateFolder}
        onOpenTrash={onOpenTrash}
      />

      {notes.length === 0 ? (
        <p className="px-2 py-1 text-xs text-text-muted">No notes yet. Create one to get started.</p>
      ) : (
        <NoteTree
          notes={notes}
          selectedId={selectedId}
          revealId={selectedId}
          actions={treeActions}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
