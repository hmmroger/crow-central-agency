import { useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { buildNoteNodes, buildNoteRootTree } from "./note-tree-nodes.js";
import type { NoteNodesOptions } from "./note-tree-nodes.types.js";

interface NoteTreeNodesOptions extends NoteNodesOptions {
  /** Places the nodes under the notes root node */
  hasRoot?: boolean;
}

/** The live or trashed notes tree, rebuilt whenever the notes index changes. */
export function useNoteTreeNodes({ isTrashed, includedIds, hasRoot = false }: NoteTreeNodesOptions) {
  const { getNote, getChildIds } = useNotesContext();

  return useMemo<TreeNode<NoteMetadata>[]>(() => {
    const nodes = buildNoteNodes({ getNote, getChildIds }, { isTrashed, includedIds });

    return hasRoot ? buildNoteRootTree(nodes) : nodes;
  }, [getNote, getChildIds, isTrashed, includedIds, hasRoot]);
}
