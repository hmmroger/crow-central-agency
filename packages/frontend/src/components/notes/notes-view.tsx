import { useCallback, useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesQuery } from "../../hooks/queries/use-notes-query.js";
import { useNoteTrashQuery } from "../../hooks/queries/use-note-trash-query.js";
import {
  NOTES_SIDEBAR_MAX_WIDTH,
  NOTES_SIDEBAR_MIN_WIDTH,
  NOTES_SIDEBAR_TAB,
  useAppStore,
} from "../../stores/app-store.js";
import { useResizablePanel } from "../../hooks/use-resizable-panel.js";
import type { HeaderBreadcrumb } from "../../providers/header-provider.types.js";
import { getNotePath } from "../../utils/note-tree.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { PanelResizeHandle } from "../layout/panel-resize-handle.js";
import { EmptyState } from "../common/empty-state.js";
import { NoteBrowseSidebar } from "./note-browse-sidebar.js";
import { NoteTrashSidebar } from "./note-trash-sidebar.js";
import { NoteWorkspace } from "./note-workspace.js";

const VIEW_TITLE = "Notes";
/** Note ids are lowercased, so an uppercase id never collides with one */
const TRASH_CRUMB: HeaderBreadcrumb = { id: "TRASH", label: "Trash" };

export function NotesView() {
  const { data: notes = [], isLoading, error } = useNotesQuery();
  const sidebarWidth = useAppStore((state) => state.notesSidebarWidth);
  const setSidebarWidth = useAppStore((state) => state.setNotesSidebarWidth);
  const selectedId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const selectedTrashId = useAppStore((state) => state.selectedTrashNoteId);
  const selectTrashNote = useAppStore((state) => state.selectTrashNote);
  const isTrashTab = useAppStore((state) => state.notesSidebarTab === NOTES_SIDEBAR_TAB.TRASH);
  const { data: trashedNotes = [] } = useNoteTrashQuery({ enabled: isTrashTab });

  const resizeHandle = useResizablePanel({
    minWidth: NOTES_SIDEBAR_MIN_WIDTH,
    maxWidth: NOTES_SIDEBAR_MAX_WIDTH,
    currentWidth: sidebarWidth,
    onResize: setSidebarWidth,
    direction: "left",
  });

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);

  // Each tab keeps its own selection, so the active one decides what the
  // workspace shows.
  const workspaceNote = useMemo(() => {
    if (!isTrashTab) {
      return selectedNote;
    }

    return trashedNotes.find((note) => note.id === selectedTrashId);
  }, [isTrashTab, selectedNote, trashedNotes, selectedTrashId]);

  const breadcrumbs = useMemo<HeaderBreadcrumb[]>(() => {
    const path = workspaceNote ? getNotePath(isTrashTab ? trashedNotes : notes, workspaceNote.id) : [];
    const selectCrumb = isTrashTab ? selectTrashNote : selectNote;
    const noteCrumbs = path.map((metadata) => ({
      id: metadata.id,
      label: metadata.name,
      onClick: () => selectCrumb(metadata.id),
    }));

    return isTrashTab ? [TRASH_CRUMB].concat(noteCrumbs) : noteCrumbs;
  }, [workspaceNote, isTrashTab, trashedNotes, notes, selectTrashNote, selectNote]);

  const handleSelect = useCallback(
    (metadata: NoteMetadata) => {
      selectNote(metadata.id);
    },
    [selectNote]
  );

  if (error) {
    return (
      <>
        <HeaderPortal title={VIEW_TITLE} />
        <EmptyState message="Could not load notes" description={error.message} />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <HeaderPortal title={VIEW_TITLE} />
        <p className="p-panel text-sm text-text-muted">Loading...</p>
      </>
    );
  }

  return (
    <div className="flex h-full">
      <HeaderPortal title={VIEW_TITLE} breadcrumbs={breadcrumbs} />
      <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-y-auto border-r border-border-subtle p-2">
        {isTrashTab ? (
          <NoteTrashSidebar />
        ) : (
          <NoteBrowseSidebar notes={notes} selectedId={selectedId} onSelect={handleSelect} />
        )}
      </aside>

      <PanelResizeHandle onPointerDown={resizeHandle.handlePointerDown} onKeyDown={resizeHandle.handleKeyDown} />

      <section className="flex-1 min-w-0 overflow-hidden">
        <NoteWorkspace key={workspaceNote?.id} note={workspaceNote} />
      </section>
    </div>
  );
}
