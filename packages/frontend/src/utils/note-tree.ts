import { FileQuestion, FileText, Folder, FolderOpen, FolderTree, Image, type LucideIcon } from "lucide-react";
import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteContentType, type NoteMetadata } from "@crow-central-agency/shared";
import type { TreeNode } from "../components/common/tree-view/tree-view.types.js";

/** Note ids are lowercased, so an uppercase id never collides with one */
export const NOTES_ROOT_NODE_ID = "NOTES_ROOT";

const NOTES_ROOT_LABEL = "Notes";

const NOTE_CONTENT_ICON: Record<NoteContentType, LucideIcon> = {
  [NOTE_CONTENT_TYPE.TEXT]: FileText,
  [NOTE_CONTENT_TYPE.IMAGE]: Image,
  [NOTE_CONTENT_TYPE.UNKNOWN]: FileQuestion,
};

/**
 * Compose the flat note list into a display tree via `parentId`.
 * Notes whose parent is missing from the list are treated as roots.
 */
export function buildNoteTree(notes: NoteMetadata[]): TreeNode<NoteMetadata>[] {
  const nodesById = new Map<string, TreeNode<NoteMetadata>>();
  for (const metadata of notes) {
    nodesById.set(metadata.id, toTreeNode(metadata));
  }

  const roots: TreeNode<NoteMetadata>[] = [];
  for (const node of nodesById.values()) {
    const parent = node.data.parentId ? nodesById.get(node.data.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortNoteNodes(roots);

  return roots;
}

/** A tree containing only the notes root, with `notes` nested under it; selecting it means the root itself. */
export function buildNoteRootTree(notes: NoteMetadata[]): TreeNode<NoteMetadata | undefined>[] {
  return [
    {
      id: NOTES_ROOT_NODE_ID,
      label: NOTES_ROOT_LABEL,
      icon: FolderTree,
      iconClassName: "text-accent",
      isExpandable: true,
      children: buildNoteTree(notes),
      data: undefined,
    },
  ];
}

function toTreeNode(metadata: NoteMetadata): TreeNode<NoteMetadata> {
  if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER) {
    return {
      id: metadata.id,
      label: metadata.name,
      icon: Folder,
      expandedIcon: FolderOpen,
      iconClassName: "text-accent",
      isExpandable: true,
      children: [],
      data: metadata,
    };
  }

  return {
    id: metadata.id,
    label: metadata.name,
    icon: NOTE_CONTENT_ICON[metadata.contentType],
    isExpandable: false,
    children: [],
    data: metadata,
  };
}

/** Folders first, then by name — an order that does not shift as notes are edited. */
function sortNoteNodes(nodes: TreeNode<NoteMetadata>[]): void {
  nodes.sort(compareNoteNodes);
  for (const node of nodes) {
    sortNoteNodes(node.children);
  }
}

function compareNoteNodes(first: TreeNode<NoteMetadata>, second: TreeNode<NoteMetadata>): number {
  const isFirstFolder = first.data.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isSecondFolder = second.data.entityType === ENTITY_TYPE.NOTE_FOLDER;
  if (isFirstFolder !== isSecondFolder) {
    return isFirstFolder ? -1 : 1;
  }

  return first.data.name.localeCompare(second.data.name);
}
