import { useCallback, useMemo, useState } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import type { TreeNode } from "../common/tree/tree.types.js";

/**
 * The live selection mapped onto tag rows. A note can sit under several tags,
 * so the clicked row stays highlighted; a selection made elsewhere falls on
 * the note's first row.
 */
export function useTagTreeSelection(nodes: TreeNode<NoteMetadata>[]) {
  const selectedNoteId = useAppStore((state) => state.selectedNoteId);
  const selectNote = useAppStore((state) => state.selectNote);
  const [clickedRowId, setClickedRowId] = useState<string>();

  const selectedRowId = useMemo(() => {
    if (!selectedNoteId) {
      return undefined;
    }

    const matchingRows = nodes
      .flatMap((tagNode) => tagNode.children)
      .filter((noteRow) => noteRow.data?.id === selectedNoteId);

    return matchingRows.find((noteRow) => noteRow.id === clickedRowId)?.id ?? matchingRows[0]?.id;
  }, [nodes, selectedNoteId, clickedRowId]);

  const selectRow = useCallback(
    (rowId: string, metadata?: NoteMetadata) => {
      if (!metadata) {
        return;
      }

      setClickedRowId(rowId);
      selectNote(metadata.id);
    },
    [selectNote]
  );

  return { selectedRowId, selectRow };
}
