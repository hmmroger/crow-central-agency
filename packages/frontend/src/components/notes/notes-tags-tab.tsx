import { useNotesContext } from "../../providers/notes-provider.js";
import { useTagsContext } from "../../providers/tags-provider.js";
import { Tree } from "../common/tree/tree.js";
import { NotesTreeStatus } from "./notes-tree-status.js";
import { useTagTreeNodes } from "./use-tag-tree-nodes.js";
import { useTagTreeSelection } from "./use-tag-tree-selection.js";

/** Live notes grouped under their tags, read-only, sharing the live selection with the Notes tab. */
export function NotesTagsTab() {
  const { listStatus } = useTagsContext();
  const { getListStatus } = useNotesContext();
  const nodes = useTagTreeNodes();
  const { selectedRowId, selectRow } = useTagTreeSelection(nodes);
  const notesStatus = getListStatus(false);
  const tagCountLabel = `${nodes.length} ${nodes.length === 1 ? "tag" : "tags"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-2xs text-text-muted">{tagCountLabel}</span>
      </div>

      <NotesTreeStatus
        isLoading={listStatus.isLoading || notesStatus.isLoading}
        error={listStatus.error ?? notesStatus.error}
        isEmpty={nodes.length === 0}
        emptyMessage="No tags yet. Add #tags at the end of a note."
      >
        <Tree nodes={nodes} selectedId={selectedRowId} revealId={selectedRowId} onSelect={selectRow} ariaLabel="Tags" />
      </NotesTreeStatus>
    </div>
  );
}
