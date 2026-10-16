import { Archive, NotebookText, Tags } from "lucide-react";
import { useNotesContext } from "../../providers/notes-provider.js";
import { NOTES_SIDEBAR_TAB, useAppStore, type NotesSidebarTab } from "../../stores/app-store.js";
import { TabBar, type TabDefinition } from "../common/tab-bar.js";
import { NotesBacklinks } from "./notes-backlinks.js";
import { NotesBrowseTab } from "./notes-browse-tab.js";
import { NotesTagsTab } from "./notes-tags-tab.js";
import { NotesTrashTab } from "./notes-trash-tab.js";

const NOTES_SIDEBAR_TABS: TabDefinition<NotesSidebarTab>[] = [
  { id: NOTES_SIDEBAR_TAB.NOTES, label: "Notes", icon: NotebookText },
  { id: NOTES_SIDEBAR_TAB.TAGS, label: "Tags", icon: Tags },
  { id: NOTES_SIDEBAR_TAB.TRASH, label: "Trash", icon: Archive },
];

/**
 * The notes, tags and trash tabs; notes and tags share the live selection, trash keeps its own.
 * Below the live tabs, the backlinks of the open live entry.
 */
export function NotesSidebar() {
  const { getNote } = useNotesContext();
  const activeTab = useAppStore((state) => state.notesSidebarTab);
  const setNotesSidebarTab = useAppStore((state) => state.setNotesSidebarTab);
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const openEntry = selectedNoteId ? getNote(selectedNoteId) : undefined;
  const isBacklinksShown = activeTab !== NOTES_SIDEBAR_TAB.TRASH && openEntry !== undefined && !openEntry.isTrashed;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <TabBar
        tabs={NOTES_SIDEBAR_TABS}
        activeTab={activeTab}
        onTabChange={setNotesSidebarTab}
        layoutId="notesSidebar"
      />

      {activeTab === NOTES_SIDEBAR_TAB.NOTES && <NotesBrowseTab />}
      {activeTab === NOTES_SIDEBAR_TAB.TAGS && <NotesTagsTab />}
      {activeTab === NOTES_SIDEBAR_TAB.TRASH && <NotesTrashTab />}

      {isBacklinksShown && <NotesBacklinks targetId={openEntry.id} />}
    </div>
  );
}
