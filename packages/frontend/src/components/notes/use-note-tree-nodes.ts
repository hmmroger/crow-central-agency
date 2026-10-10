import { useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { buildNoteNodes, buildNoteRootTree } from "./note-tree-nodes.js";

interface NoteTreeNodesOptions {
  isTrashed: boolean;
  /** Leaves out a note and everything under it; keep it stable, it is a memo dependency */
  isIncluded?: (noteId: string) => boolean;
  /** Places the nodes under the notes root node */
  hasRoot?: boolean;
}

/** The live or trashed notes tree, rebuilt whenever the notes index changes. */
export function useNoteTreeNodes({ isTrashed, isIncluded, hasRoot = false }: NoteTreeNodesOptions) {
  const { getNote, getChildIds } = useNotesContext();

  return useMemo<TreeNode<NoteMetadata>[]>(() => {
    const nodes = buildNoteNodes({ getNote, getChildIds }, undefined, isTrashed, isIncluded);

    return hasRoot ? buildNoteRootTree(nodes) : nodes;
  }, [getNote, getChildIds, isTrashed, isIncluded, hasRoot]);
}
