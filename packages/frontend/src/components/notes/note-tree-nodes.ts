import { FileQuestion, FileText, Folder, FolderOpen, Image, type LucideIcon } from "lucide-react";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";
import type { TreeNode } from "../common/tree/tree.types.js";

/** Note ids are lowercased, so an uppercase id never collides with one */
export const NOTES_ROOT_NODE_ID = "NOTES_ROOT";

/** The name of the notes root, the folder above every top-level note */
export const NOTES_ROOT_LABEL = "Notes";

const NOTE_CONTENT_ICON: Record<NoteContentType, LucideIcon> = {
  [NOTE_CONTENT_TYPE.TEXT]: FileText,
  [NOTE_CONTENT_TYPE.IMAGE]: Image,
  [NOTE_CONTENT_TYPE.UNKNOWN]: FileQuestion,
};

/** The one shape of a note row in every tree; `id` overrides the note id where a note can appear more than once. */
export function toTreeNode(
  metadata: NoteMetadata,
  children: TreeNode<NoteMetadata>[],
  id = metadata.id
): TreeNode<NoteMetadata> {
  if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return {
      id,
      label: metadata.name,
      icon: Folder,
      expandedIcon: FolderOpen,
      iconClassName: "text-accent",
      isExpandable: true,
      children,
      data: metadata,
    };
  }

  return {
    id,
    label: metadata.name,
    icon: NOTE_CONTENT_ICON[metadata.contentType],
    isExpandable: false,
    children,
    data: metadata,
  };
}
