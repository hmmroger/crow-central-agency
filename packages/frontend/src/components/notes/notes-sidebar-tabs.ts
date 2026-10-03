import { Archive, NotebookText } from "lucide-react";
import { NOTES_SIDEBAR_TAB, type NotesSidebarTab } from "../../stores/app-store.js";
import type { TabDefinition } from "../common/tab-bar.js";

export const NOTES_SIDEBAR_TABS: TabDefinition<NotesSidebarTab>[] = [
  { id: NOTES_SIDEBAR_TAB.NOTES, label: "Notes", icon: NotebookText },
  { id: NOTES_SIDEBAR_TAB.TRASH, label: "Trash", icon: Archive },
];

export const NOTES_SIDEBAR_LAYOUT_ID = "notesSidebar";
