import { useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { buildNoteNodes } from "../../utils/note-tree.js";
import { Tree } from "../common/tree/tree.js";
import type { TreeNodeAction } from "../common/tree/tree.types.js";

interface NoteTreeProps {
  isTrashed: boolean;
  selectedId?: string;
  /** Note to bring into view: its ancestors are expanded when it changes */
  revealId?: string;
  actions?: readonly TreeNodeAction<NoteMetadata>[];
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
    <Tree
      nodes={nodes}
      selectedId={selectedId}
      revealId={revealId}
      actions={actions}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
    />
  );
}
