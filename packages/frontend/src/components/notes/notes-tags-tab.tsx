import { useCallback, useMemo, useState } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useTagsContext } from "../../providers/tags-provider.js";
import { useAppStore } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { Tree } from "../common/tree/tree.js";
import { buildTagNodes } from "./note-tree-nodes.js";

const STATUS_CLASS = "px-2 py-1 text-xs text-text-muted";

/**
 * Live notes grouped under their tags, read-only. Shares the live selection
 * with the Notes tab: the clicked row stays highlighted, and a selection made
 * elsewhere highlights the note's first row.
 */
export function NotesTagsTab() {
  const { getTags, getEntityIds, listStatus } = useTagsContext();
  const { getNote, getListStatus } = useNotesContext();
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const [clickedRowId, setClickedRowId] = useState<string>();
  const notesStatus = getListStatus(false);
  const isLoading = listStatus.isLoading || notesStatus.isLoading;
  const error = listStatus.error ?? notesStatus.error;
  const nodes = useMemo(() => buildTagNodes({ getTags, getEntityIds }, { getNote }), [getTags, getEntityIds, getNote]);
  const tagCountLabel = `${nodes.length} ${nodes.length === 1 ? "tag" : "tags"}`;

  const selectedRowId = useMemo(() => {
    if (!selectedNoteId) {
      return undefined;
    }

    const matchingRows = nodes
      .flatMap((tagNode) => tagNode.children)
      .filter((noteRow) => noteRow.data?.id === selectedNoteId);

    return matchingRows.find((noteRow) => noteRow.id === clickedRowId)?.id ?? matchingRows[0]?.id;
  }, [nodes, selectedNoteId, clickedRowId]);

  const handleSelect = useCallback(
    (rowId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      setClickedRowId(rowId);
      selectNote(metadata.id);
    },
    [selectNote]
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">{tagCountLabel}</span>
      </div>

      {error && <p className="px-2 py-1 text-xs text-error">{getErrorMessage(error)}</p>}

      {isLoading ? (
        <p className={STATUS_CLASS}>Loading...</p>
      ) : nodes.length === 0 ? (
        <p className={STATUS_CLASS}>No tags yet. Add #tags at the end of a note.</p>
      ) : (
        <Tree
          nodes={nodes}
          selectedId={selectedRowId}
          revealId={selectedRowId}
          onSelect={handleSelect}
          ariaLabel="Tags"
        />
      )}
    </div>
  );
}
