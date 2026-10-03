import { useCallback, useMemo } from "react";
import { FilePlus, FolderInput, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { useNoteAuthoring } from "../../hooks/dialogs/use-note-authoring.js";
import { NOTES_SIDEBAR_TAB, useAppStore } from "../../stores/app-store.js";
import { ActionButton } from "../common/action-button.js";
import { TabBar } from "../common/tab-bar.js";
import type { TreeRowAction } from "../common/tree-view/tree-view.types.js";
import { NoteTree } from "./note-tree.js";
import { NOTES_SIDEBAR_LAYOUT_ID, NOTES_SIDEBAR_TABS } from "./notes-sidebar-tabs.js";

interface NoteBrowseSidebarProps {
  /** Flat live note tree as served by the backend */
  notes: NoteMetadata[];
  selectedId?: string;
  onSelect: (metadata: NoteMetadata) => void;
}

const ROOT_FOLDER_NAME = "Notes";

/** The live note tree with its create, rename, move and delete affordances. */
export function NoteBrowseSidebar({ notes, selectedId, onSelect }: NoteBrowseSidebarProps) {
  const { createFolder, createNote, renameNote, moveNote, deleteNote } = useNoteAuthoring(onSelect);
  const setNotesSidebarTab = useAppStore((state) => state.setNotesSidebarTab);
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

  const treeActions = useMemo<TreeRowAction<NoteMetadata>[]>(
    () => [
      { id: "rename", label: "Rename", icon: Pencil, onSelect: renameNote },
      { id: "move", label: "Move", icon: FolderInput, onSelect: moveNote },
      { id: "delete", label: "Delete", icon: Trash2, onSelect: deleteNote },
    ],
    [renameNote, moveNote, deleteNote]
  );
  const targetName = targetFolder?.name ?? ROOT_FOLDER_NAME;

  return (
    <div className="flex flex-col gap-1">
      <TabBar
        tabs={NOTES_SIDEBAR_TABS}
        activeTab={NOTES_SIDEBAR_TAB.NOTES}
        onTabChange={setNotesSidebarTab}
        layoutId={NOTES_SIDEBAR_LAYOUT_ID}
        trailing={
          <>
            <ActionButton icon={FilePlus} label={`New note in ${targetName}`} iconOnly onClick={handleCreateNote} />
            <ActionButton
              icon={FolderPlus}
              label={`New folder in ${targetName}`}
              iconOnly
              onClick={handleCreateFolder}
            />
          </>
        }
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
          ariaLabel="Notes"
        />
      )}
    </div>
  );
}
