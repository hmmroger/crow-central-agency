import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";

/** A note tree node composed for display from the backend's flat metadata list. */
export interface NoteTreeNode {
  metadata: NoteMetadata;
  children: NoteTreeNode[];
}

/**
 * Compose the flat note list into a display tree via `parentId`.
 * Nodes whose parent is missing from the list are treated as roots.
 */
export function buildNoteTree(nodes: NoteMetadata[]): NoteTreeNode[] {
  const nodesById = new Map<string, NoteTreeNode>();
  for (const metadata of nodes) {
    nodesById.set(metadata.id, { metadata, children: [] });
  }

  const roots: NoteTreeNode[] = [];
  for (const node of nodesById.values()) {
    const parent = node.metadata.parentId ? nodesById.get(node.metadata.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortNoteNodes(roots);

  return roots;
}

/** Folders first, then by name — an order that does not shift as notes are edited. */
function sortNoteNodes(nodes: NoteTreeNode[]): void {
  nodes.sort(compareNoteNodes);
  for (const node of nodes) {
    sortNoteNodes(node.children);
  }
}

function compareNoteNodes(first: NoteTreeNode, second: NoteTreeNode): number {
  const isFirstFolder = first.metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isSecondFolder = second.metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  if (isFirstFolder !== isSecondFolder) {
    return isFirstFolder ? -1 : 1;
  }

  return first.metadata.name.localeCompare(second.metadata.name);
}
