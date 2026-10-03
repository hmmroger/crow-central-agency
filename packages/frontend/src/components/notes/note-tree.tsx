import { useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { buildNoteTree } from "../../utils/note-tree.js";
import { TreeView } from "../common/tree-view/tree-view.js";
import type { TreeRowAction } from "../common/tree-view/tree-view.types.js";

interface NoteTreeProps {
  /** Flat note metadata as served by the backend */
  notes: NoteMetadata[];
  selectedId?: string;
  /** Note to bring into view: its ancestors are expanded when it changes */
  revealId?: string;
  actions?: readonly TreeRowAction<NoteMetadata>[];
  onSelect: (metadata: NoteMetadata) => void;
  ariaLabel: string;
}

export function NoteTree({ notes, selectedId, revealId, actions, onSelect, ariaLabel }: NoteTreeProps) {
  const nodes = useMemo(() => buildNoteTree(notes), [notes]);

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
