import { useMemo } from "react";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useTagsContext } from "../../providers/tags-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { buildTagNodes } from "./note-tree-nodes.js";

/** Live notes grouped under their tags, rebuilt whenever the tags or notes index changes. */
export function useTagTreeNodes() {
  const { getTags, getEntityIds } = useTagsContext();
  const { getNote } = useNotesContext();

  return useMemo<TreeNode<NoteMetadata>[]>(
    () => buildTagNodes({ getTags, getEntityIds }, { getNote }),
    [getTags, getEntityIds, getNote]
  );
}
