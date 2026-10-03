import { useMemo } from "react";
import { useResizablePanel } from "../../hooks/use-resizable-panel.js";
import type { HeaderBreadcrumb } from "../../providers/header-provider.types.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import {
  NOTES_SIDEBAR_MAX_WIDTH,
  NOTES_SIDEBAR_MIN_WIDTH,
  NOTES_SIDEBAR_TAB,
  useAppStore,
} from "../../stores/app-store.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { PanelResizeHandle } from "../layout/panel-resize-handle.js";
import { NotesSidebar } from "./notes-sidebar.js";
import { NoteWorkspace } from "./note-workspace.js";

const VIEW_TITLE = "Notes";
/** Note ids are lowercased, so an uppercase id never collides with one */
const TRASH_CRUMB: HeaderBreadcrumb = { id: "TRASH", label: "Trash" };

/** Notes layout and header; the open note is the active tab's selection. */
export function NotesView() {
  const { getNote, getAncestorIds } = useNotesContext();
  const sidebarWidth = useAppStore((state) => state.notesSidebarWidth);
  const setSidebarWidth = useAppStore((state) => state.setNotesSidebarWidth);
  const isTrashTab = useAppStore((state) => state.notesSidebarTab === NOTES_SIDEBAR_TAB.TRASH);
  const openNoteId = useAppStore((state) => (isTrashTab ? state.selectedTrashNoteId : state.selectedNoteId));
  const selectNote = useAppStore((state) => state.selectNote);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);

  const resizeHandle = useResizablePanel({
    minWidth: NOTES_SIDEBAR_MIN_WIDTH,
    maxWidth: NOTES_SIDEBAR_MAX_WIDTH,
    currentWidth: sidebarWidth,
    onResize: setSidebarWidth,
    direction: "left",
  });

  const breadcrumbs = useMemo<HeaderBreadcrumb[]>(() => {
    const selectFolder = isTrashTab ? selectTrashNote : selectNote;
    const folderCrumbs = (openNoteId ? getAncestorIds(openNoteId) : []).map((folderId) => ({
      id: folderId,
      label: getNote(folderId)?.name ?? folderId,
      onClick: () => selectFolder(folderId),
    }));

    return isTrashTab ? [TRASH_CRUMB].concat(folderCrumbs) : folderCrumbs;
  }, [openNoteId, isTrashTab, getAncestorIds, getNote, selectTrashNote, selectNote]);

  return (
    <div className="flex h-full">
      <HeaderPortal title={VIEW_TITLE} breadcrumbs={breadcrumbs} />
      <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-y-auto border-r border-border-subtle p-2">
        <NotesSidebar />
      </aside>

      <PanelResizeHandle onPointerDown={resizeHandle.handlePointerDown} onKeyDown={resizeHandle.handleKeyDown} />

      <section className="flex-1 min-w-0 overflow-hidden">
        <NoteWorkspace key={openNoteId} note={openNoteId ? getNote(openNoteId) : undefined} />
      </section>
    </div>
  );
}
