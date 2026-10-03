import { useCallback, useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesQuery } from "../../hooks/queries/use-notes-query.js";
import { useNoteTrashQuery } from "../../hooks/queries/use-note-trash-query.js";
import { NOTES_SIDEBAR_MAX_WIDTH, NOTES_SIDEBAR_MIN_WIDTH, useAppStore } from "../../stores/app-store.js";
import { useResizablePanel } from "../../hooks/use-resizable-panel.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { PanelResizeHandle } from "../layout/panel-resize-handle.js";
import { EmptyState } from "../common/empty-state.js";
import { NoteBrowseSidebar } from "./note-browse-sidebar.js";
import { NoteTrashSidebar } from "./note-trash-sidebar.js";
import { NoteWorkspace } from "./note-workspace.js";

const VIEW_TITLE = "Notes";

export function NotesView() {
  const { data: notes = [], isLoading, error } = useNotesQuery();
  const sidebarWidth = useAppStore((state) => state.notesSidebarWidth);
  const setSidebarWidth = useAppStore((state) => state.setNotesSidebarWidth);
  const selectedId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const selectedTrashId = useAppStore((state) => state.selectedTrashNoteId);
  const isTrashOpen = useAppStore((state) => state.isNoteTrashOpen);
  const setNoteTrashOpen = useAppStore((state) => state.setNoteTrashOpen);
  const { data: trashedNotes = [] } = useNoteTrashQuery({ enabled: isTrashOpen });

  const resizeHandle = useResizablePanel({
    minWidth: NOTES_SIDEBAR_MIN_WIDTH,
    maxWidth: NOTES_SIDEBAR_MAX_WIDTH,
    currentWidth: sidebarWidth,
    onResize: setSidebarWidth,
    direction: "left",
  });

  const selectedNote = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);

  // Each pane keeps its own selection, so the open one decides what the
  // workspace shows.
  const workspaceNote = useMemo(() => {
    if (!isTrashOpen) {
      return selectedNote;
    }

    return trashedNotes.find((note) => note.id === selectedTrashId);
  }, [isTrashOpen, selectedNote, trashedNotes, selectedTrashId]);

  const handleSelect = useCallback(
    (metadata: NoteMetadata) => {
      selectNote(metadata.id);
    },
    [selectNote]
  );

  const handleOpenTrash = useCallback(() => setNoteTrashOpen(true), [setNoteTrashOpen]);
  const handleCloseTrash = useCallback(() => setNoteTrashOpen(false), [setNoteTrashOpen]);

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
      <HeaderPortal title={VIEW_TITLE} />
      <aside style={{ width: sidebarWidth }} className="shrink-0 overflow-y-auto border-r border-border-subtle p-2">
        {isTrashOpen ? (
          <NoteTrashSidebar onClose={handleCloseTrash} />
        ) : (
          <NoteBrowseSidebar
            notes={notes}
            selectedId={selectedId}
            onSelect={handleSelect}
            onOpenTrash={handleOpenTrash}
          />
        )}
      </aside>

      <PanelResizeHandle onPointerDown={resizeHandle.handlePointerDown} onKeyDown={resizeHandle.handleKeyDown} />

      <section className="flex-1 min-w-0 overflow-hidden">
        <NoteWorkspace key={workspaceNote?.id} note={workspaceNote} />
      </section>
    </div>
  );
}
