import { Tag as TagIcon } from "lucide-react";
import { ENTITY_TYPE, type NoteMetadata, type Tag } from "@crow-central-agency/shared";
import type { TreeNode } from "../common/tree/tree.types.js";
import type { NotesContextValue } from "../../providers/notes-provider.types.js";
import type { TagsContextValue } from "../../providers/tags-provider.types.js";
import { toTreeNode } from "./note-tree-nodes.js";

type TagSource = Pick<TagsContextValue, "getTags" | "getEntityIds">;
type NoteSource = Pick<NotesContextValue, "getNote">;

/**
 * One node per tag with at least one live note in the notes index, in name
 * order, holding its live notes in name order. A tag row's id is the tag id
 * and carries no data; a note row's id is unique to its tag and note.
 */
export function buildTagNodes(tags: TagSource, notes: NoteSource): TreeNode<NoteMetadata>[] {
  return tags.getTags().flatMap((tag) => toTagNodes(tag, getLiveTaggedNotes(tag, tags, notes)));
}

function getLiveTaggedNotes(tag: Tag, tags: TagSource, notes: NoteSource): NoteMetadata[] {
  return tags
    .getEntityIds(tag.id, ENTITY_TYPE.NOTE)
    .map((noteId) => notes.getNote(noteId))
    .filter((metadata) => metadata !== undefined)
    .filter((metadata) => !metadata.isTrashed);
}

/** The tag's node, or none when no live note carries it */
function toTagNodes(tag: Tag, taggedNotes: NoteMetadata[]): TreeNode<NoteMetadata>[] {
  if (taggedNotes.length === 0) {
    return [];
  }

  const children = taggedNotes
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((metadata) => toTreeNode(metadata, [], toTagNoteRowId(tag.id, metadata.id)));

  return [{ id: tag.id, label: tag.name, icon: TagIcon, isExpandable: true, children }];
}

/** Tag ids never contain ":", so a placement row's id never equals a tag row's */
function toTagNoteRowId(tagId: string, noteId: string): string {
  return `${tagId}:${noteId}`;
}
