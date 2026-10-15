import { useMemo } from "react";
import { RELATIONSHIP_TYPE, type NoteMetadata, type RelationshipQuery } from "@crow-central-agency/shared";
import { useRelationshipsQuery } from "../../hooks/queries/use-relationships-query.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { toTreeNode } from "./note-tree-nodes.js";

/**
 * One row per live note with a REFERENCE edge to `targetId`, in name order. The
 * edges come from the relationships query filtered by target and are kept
 * current by RELATIONSHIPS_CHANGED; a source not in the notes index is skipped.
 */
export function useBacklinkTreeNodes(targetId: string) {
  const { getNote } = useNotesContext();
  const filter = useMemo<RelationshipQuery>(
    () => ({ relationshipType: RELATIONSHIP_TYPE.REFERENCE, targetEntityId: targetId }),
    [targetId]
  );
  const edgesQuery = useRelationshipsQuery(filter);

  const nodes = useMemo<TreeNode<NoteMetadata>[]>(
    () =>
      (edgesQuery.data ?? [])
        .map((edge) => getNote(edge.sourceEntityId))
        .filter((metadata) => metadata !== undefined)
        .filter((metadata) => !metadata.isTrashed)
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((metadata) => toTreeNode(metadata, [])),
    [edgesQuery.data, getNote]
  );

  return { nodes, isLoading: edgesQuery.isLoading, error: edgesQuery.error ?? undefined };
}
