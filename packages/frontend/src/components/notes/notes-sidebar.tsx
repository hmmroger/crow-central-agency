import { Archive, NotebookText } from "lucide-react";
import { NOTES_SIDEBAR_TAB, useAppStore, type NotesSidebarTab } from "../../stores/app-store.js";
import { TabBar, type TabDefinition } from "../common/tab-bar.js";
import { NotesBrowseTab } from "./notes-browse-tab.js";
import { NotesTrashTab } from "./notes-trash-tab.js";

const NOTES_SIDEBAR_TABS: TabDefinition<NotesSidebarTab>[] = [
  { id: NOTES_SIDEBAR_TAB.NOTES, label: "Notes", icon: NotebookText },
  { id: NOTES_SIDEBAR_TAB.TRASH, label: "Trash", icon: Archive },
];

/** The notes and trash tabs; each tab keeps its own selection. */
export function NotesSidebar() {
  const activeTab = useAppStore((state) => state.notesSidebarTab);
  const setNotesSidebarTab = useAppStore((state) => state.setNotesSidebarTab);

  return (
    <div className="flex flex-col gap-1">
      <TabBar
        tabs={NOTES_SIDEBAR_TABS}
        activeTab={activeTab}
        onTabChange={setNotesSidebarTab}
        layoutId="notesSidebar"
      />

      {activeTab === NOTES_SIDEBAR_TAB.NOTES && <NotesBrowseTab />}
      {activeTab === NOTES_SIDEBAR_TAB.TRASH && <NotesTrashTab />}
    </div>
  );
}
