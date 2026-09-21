import { useCallback, useMemo, useState } from "react";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { useNotesQuery } from "../../hooks/queries/use-notes-query.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { EmptyState } from "../common/empty-state.js";
import { NoteTree } from "./note-tree.js";
import { NoteReader } from "./note-reader.js";

const VIEW_TITLE = "Notes";

/**
 * Notes view — tree sidebar (left) and a read-only reader (right).
 * Notes live as files under the configured notes root; the backend serves the
 * tree and content, this view only composes and renders them.
 */
export function NotesView() {
  const { data: notes = [], isLoading, error } = useNotesQuery();
  const [selectedId, setSelectedId] = useState<string>();

  const selectedNode = useMemo(() => notes.find((note) => note.id === selectedId), [notes, selectedId]);

  const handleSelect = useCallback((metadata: NoteMetadata) => {
    setSelectedId(metadata.id);
  }, []);

  if (error) {
    return (
      <>
        <HeaderPortal title={VIEW_TITLE} />
        <EmptyState message="Could not load notes" description={error.message} />
      </>
    );
  }

  if (!isLoading && notes.length === 0) {
    return (
      <>
        <HeaderPortal title={VIEW_TITLE} />
        <EmptyState message="No notes yet" description="Add markdown files under your notes folder to see them here." />
      </>
    );
  }

  return (
    <div className="flex h-full">
      <HeaderPortal title={VIEW_TITLE} />
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-border-subtle p-2">
        <NoteTree nodes={notes} selectedId={selectedId} onSelect={handleSelect} />
      </aside>

      <section className="flex-1 min-w-0 overflow-y-auto p-panel">
        {selectedNode?.entityType === ENTITY_TYPE.NOTE ? (
          <NoteReader key={selectedNode.id} note={selectedNode} />
        ) : (
          <p className="text-sm text-text-muted">Select a note to read it.</p>
        )}
      </section>
    </div>
  );
}
