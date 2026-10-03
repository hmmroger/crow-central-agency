import { useMemo } from "react";
import { useNotesContext } from "../../providers/notes-provider.js";
import { buildNoteNodes } from "../../utils/note-tree.js";
import { TreeView } from "../common/tree-view/tree-view.js";
import type { TreeRowAction } from "../common/tree-view/tree-view.types.js";

interface NoteTreeProps {
  isTrashed: boolean;
  selectedId?: string;
  /** Note to bring into view: its ancestors are expanded when it changes */
  revealId?: string;
  /** Row actions, handed the row's note id */
  actions?: readonly TreeRowAction<string>[];
  onSelect: (noteId: string) => void;
  ariaLabel: string;
}

export function NoteTree({ isTrashed, selectedId, revealId, actions, onSelect, ariaLabel }: NoteTreeProps) {
  const { getNote, getChildIds } = useNotesContext();
  const nodes = useMemo(
    () => buildNoteNodes({ getNote, getChildIds }, undefined, isTrashed),
    [getNote, getChildIds, isTrashed]
  );

  return (
    <TreeView
      nodes={nodes}
      selectedId={selectedId}
      revealId={revealId}
      actions={actions}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
    />
  );
}
