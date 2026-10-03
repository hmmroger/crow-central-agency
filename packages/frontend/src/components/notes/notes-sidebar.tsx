import { useMemo, type ReactNode } from "react";
import { Archive, FilePlus, FolderInput, FolderPlus, NotebookText, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { ENTITY_TYPE } from "@crow-central-agency/shared";
import { useNoteCommands } from "../../hooks/dialogs/use-note-commands.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { NOTES_SIDEBAR_TAB, useAppStore, type NotesSidebarTab } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { TabBar, type TabDefinition } from "../common/tab-bar.js";
import type { TreeNodeAction } from "../common/tree/tree.types.js";
import { NoteTree } from "./note-tree.js";

/** What one sidebar tab shows and offers */
interface NotesSidebarTabConfig {
  isTrashed: boolean;
  selectedId?: string;
  onSelect: (noteId: string) => void;
  /** Controls right-aligned in the tab row */
  trailing: ReactNode;
  actions: TreeNodeAction<string>[];
  emptyText: string;
  treeLabel: string;
}

const NOTES_SIDEBAR_TABS: TabDefinition<NotesSidebarTab>[] = [
  { id: NOTES_SIDEBAR_TAB.NOTES, label: "Notes", icon: NotebookText },
  { id: NOTES_SIDEBAR_TAB.TRASH, label: "Trash", icon: Archive },
];

const ROOT_FOLDER_NAME = "Notes";
const STATUS_CLASS = "px-2 py-1 text-xs text-text-muted";

/** The notes and trash trees behind one tab row; each tab keeps its own selection. */
export function NotesSidebar() {
  const { getNote, getChildIds, getListStatus } = useNotesContext();
  const { createNote, createFolder, renameNote, moveNote, deleteNote, restoreNote, emptyTrash } = useNoteCommands();
  const activeTab = useAppStore((state) => state.notesSidebarTab);
  const setNotesSidebarTab = useAppStore((state) => state.setNotesSidebarTab);
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const selectedTrashNoteId = useAppStore((state) => state.selectedTrashNoteId);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);
  const isTrashEmpty = getChildIds(undefined, true).length === 0;

  // New notes land in the selected folder, or beside the selected note.
  const targetFolder = useMemo(() => {
    const selectedNote = selectedNoteId ? getNote(selectedNoteId) : undefined;
    if (selectedNote?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      return selectedNote;
    }

    return selectedNote?.parentId ? getNote(selectedNote.parentId) : undefined;
  }, [getNote, selectedNoteId]);

  const tabConfigs = useMemo<Record<NotesSidebarTab, NotesSidebarTabConfig>>(() => {
    const targetName = targetFolder?.name ?? ROOT_FOLDER_NAME;

    return {
      [NOTES_SIDEBAR_TAB.NOTES]: {
        isTrashed: false,
        selectedId: selectedNoteId,
        onSelect: selectNote,
        trailing: (
          <>
            <ActionButton
              icon={FilePlus}
              label={`New note in ${targetName}`}
              iconOnly
              onClick={() => createNote(targetFolder?.id)}
            />
            <ActionButton
              icon={FolderPlus}
              label={`New folder in ${targetName}`}
              iconOnly
              onClick={() => createFolder(targetFolder?.id)}
            />
          </>
        ),
        actions: [
          { id: "rename", label: "Rename", icon: Pencil, onSelect: renameNote },
          { id: "move", label: "Move", icon: FolderInput, onSelect: moveNote },
          { id: "delete", label: "Delete", icon: Trash2, onSelect: deleteNote },
        ],
        emptyText: "No notes yet. Create one to get started.",
        treeLabel: "Notes",
      },
      [NOTES_SIDEBAR_TAB.TRASH]: {
        isTrashed: true,
        selectedId: selectedTrashNoteId,
        onSelect: selectTrashNote,
        trailing: (
          <ActionButton
            label="Empty trash"
            variant={ACTION_BUTTON_VARIANT.DESTRUCTIVE}
            disabled={isTrashEmpty}
            onClick={emptyTrash}
          />
        ),
        actions: [
          { id: "restore", label: "Restore", icon: RotateCcw, onSelect: restoreNote },
          { id: "delete", label: "Delete permanently", icon: Trash2, onSelect: deleteNote },
        ],
        emptyText: "The trash is empty.",
        treeLabel: "Trash",
      },
    };
  }, [
    targetFolder,
    selectedNoteId,
    selectNote,
    selectedTrashNoteId,
    selectTrashNote,
    isTrashEmpty,
    createNote,
    createFolder,
    renameNote,
    moveNote,
    deleteNote,
    restoreNote,
    emptyTrash,
  ]);

  const tab = tabConfigs[activeTab];
  const { isLoading, error } = getListStatus(tab.isTrashed);
  const isEmpty = getChildIds(undefined, tab.isTrashed).length === 0;

  return (
    <div className="flex flex-col gap-1">
      <TabBar
        tabs={NOTES_SIDEBAR_TABS}
        activeTab={activeTab}
        onTabChange={setNotesSidebarTab}
        layoutId="notesSidebar"
        trailing={tab.trailing}
      />

      {error && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(error)}</p>}

      {isLoading ? (
        <p className={STATUS_CLASS}>Loading...</p>
      ) : isEmpty ? (
        <p className={STATUS_CLASS}>{tab.emptyText}</p>
      ) : (
        <NoteTree
          key={activeTab}
          isTrashed={tab.isTrashed}
          selectedId={tab.selectedId}
          revealId={tab.selectedId}
          actions={tab.actions}
          onSelect={tab.onSelect}
          ariaLabel={tab.treeLabel}
        />
      )}
    </div>
  );
}
