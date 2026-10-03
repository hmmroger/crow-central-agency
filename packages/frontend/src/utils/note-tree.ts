import { FileQuestion, FileText, Folder, FolderOpen, FolderTree, Image, type LucideIcon } from "lucide-react";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";
import type { TreeNode } from "../components/common/tree/tree.types.js";
import type { NotesContextValue } from "../providers/notes-provider.types.js";

/** Note ids are lowercased, so an uppercase id never collides with one */
export const NOTES_ROOT_NODE_ID = "NOTES_ROOT";

const NOTES_ROOT_LABEL = "Notes";
const FOLDER_ICON_CLASS = "text-accent";

const NOTE_CONTENT_ICON: Record<NoteContentType, LucideIcon> = {
  [NOTE_CONTENT_TYPE.TEXT]: FileText,
  [NOTE_CONTENT_TYPE.IMAGE]: Image,
  [NOTE_CONTENT_TYPE.UNKNOWN]: FileQuestion,
};

/**
 * Tree nodes for the live or trashed notes under `parentId`, folders first and
 * then by name, each carrying its metadata. `isIncluded` leaves out a note and
 * everything under it.
 */
export function buildNoteNodes(
  notes: Pick<NotesContextValue, "getNote" | "getChildIds">,
  parentId: string | undefined,
  isTrashed: boolean,
  isIncluded?: (noteId: string) => boolean
): TreeNode<NoteMetadata>[] {
  const children: NoteMetadata[] = [];
  for (const childId of notes.getChildIds(parentId, isTrashed)) {
    const metadata = notes.getNote(childId);
    if (metadata && (isIncluded?.(childId) ?? true)) {
      children.push(metadata);
    }
  }

  return children
    .sort(compareNotes)
    .map((metadata) => toTreeNode(metadata, buildNoteNodes(notes, metadata.id, isTrashed, isIncluded)));
}

/** A tree containing only the notes root, with `children` under it. */
export function buildNoteRootTree(children: TreeNode<NoteMetadata>[]): TreeNode<NoteMetadata>[] {
  return [
    {
      id: NOTES_ROOT_NODE_ID,
      label: NOTES_ROOT_LABEL,
      icon: FolderTree,
      iconClassName: FOLDER_ICON_CLASS,
      isExpandable: true,
      children,
    },
  ];
}

function toTreeNode(metadata: NoteMetadata, children: TreeNode<NoteMetadata>[]): TreeNode<NoteMetadata> {
  if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return {
      id: metadata.id,
      label: metadata.name,
      icon: Folder,
      expandedIcon: FolderOpen,
      iconClassName: FOLDER_ICON_CLASS,
      isExpandable: true,
      children,
      data: metadata,
    };
  }

  return {
    id: metadata.id,
    label: metadata.name,
    icon: NOTE_CONTENT_ICON[metadata.contentType],
    isExpandable: false,
    children,
    data: metadata,
  };
}

/** Folders first, then by name — an order that does not shift as notes are edited. */
function compareNotes(first: NoteMetadata, second: NoteMetadata): number {
  const isFirstFolder = first.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isSecondFolder = second.entityType === ENTITY_TYPE.NOTE_FOLDER;
  if (isFirstFolder !== isSecondFolder) {
    return isFirstFolder ? -1 : 1;
  }

  return first.name.localeCompare(second.name);
}
