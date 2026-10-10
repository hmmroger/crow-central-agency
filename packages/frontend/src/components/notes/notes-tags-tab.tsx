import { useNotesContext } from "../../providers/notes-provider.js";
import { useTagsContext } from "../../providers/tags-provider.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { Tree } from "../common/tree/tree.js";
import { useTagTreeNodes } from "./use-tag-tree-nodes.js";
import { useTagTreeSelection } from "./use-tag-tree-selection.js";

const STATUS_CLASS = "px-2 py-1 text-xs text-text-muted";

/** Live notes grouped under their tags, read-only, sharing the live selection with the Notes tab. */
export function NotesTagsTab() {
  const { listStatus } = useTagsContext();
  const { getListStatus } = useNotesContext();
  const nodes = useTagTreeNodes();
  const { selectedRowId, selectRow } = useTagTreeSelection(nodes);
  const notesStatus = getListStatus(false);
  const isLoading = listStatus.isLoading || notesStatus.isLoading;
  const error = listStatus.error ?? notesStatus.error;
  const tagCountLabel = `${nodes.length} ${nodes.length === 1 ? "tag" : "tags"}`;

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
        <Tree nodes={nodes} selectedId={selectedRowId} revealId={selectedRowId} onSelect={selectRow} ariaLabel="Tags" />
      )}
    </div>
  );
}
