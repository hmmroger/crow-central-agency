import { useMemo } from "react";
import { Tag as TagIcon } from "lucide-react";
import { ENTITY_TYPE, type NoteMetadata, type Tag } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import { useTagsContext } from "../../providers/tags-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { toTreeNode } from "./note-tree-nodes.js";

/**
 * One node per tag with at least one live note in the notes index, in name
 * order, holding its live notes in name order. A tag row's id is the tag id
 * and carries no data; a note row's id is unique to its tag and note.
 * Rebuilt whenever the tags or notes index changes.
 */
export function useTagTreeNodes() {
  const { tags, entityIdsByTagId } = useTagsContext();
  const { getNote } = useNotesContext();

  return useMemo<TreeNode<NoteMetadata>[]>(() => {
    const nodes: TreeNode<NoteMetadata>[] = [];
    for (const tag of tags) {
      const liveNotes = (entityIdsByTagId.get(tag.id)?.get(ENTITY_TYPE.NOTE) ?? [])
        .map((noteId) => getNote(noteId))
        .filter((metadata) => metadata !== undefined)
        .filter((metadata) => !metadata.isTrashed);

      if (liveNotes.length > 0) {
        nodes.push(toTagNode(tag, liveNotes));
      }
    }

    return nodes;
  }, [tags, entityIdsByTagId, getNote]);
}

function toTagNode(tag: Tag, liveNotes: NoteMetadata[]): TreeNode<NoteMetadata> {
  const children = liveNotes
    .toSorted((first, second) => first.name.localeCompare(second.name))
    .map((metadata) => toTreeNode(metadata, [], toTagNoteRowId(tag.id, metadata.id)));

  return { id: tag.id, label: tag.name, icon: TagIcon, isExpandable: true, children };
}

function toTagNoteRowId(tagId: string, noteId: string): string {
  return `${tagId}:${noteId}`;
}
