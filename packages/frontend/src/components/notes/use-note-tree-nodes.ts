import { useMemo } from "react";
import { FolderTree } from "lucide-react";
import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { useNotesContext } from "../../providers/notes-provider.js";
import type { TreeNode } from "../common/tree/tree.types.js";
import { FOLDER_ICON_CLASS, NOTES_ROOT_LABEL, NOTES_ROOT_NODE_ID, toTreeNode } from "./note-tree-nodes.js";

interface NoteTreeNodesOptions {
  isTrashed: boolean;
  /** Only these notes, and what is under them, are included; every note when absent */
  includedIds?: ReadonlySet<string>;
  /** Places the nodes under the notes root node */
  hasRoot?: boolean;
}

type ChildrenByParentId = ReadonlyMap<string | undefined, NoteMetadata[]>;

/**
 * The live or trashed notes tree, folders first and then by name, each node
 * carrying its metadata. Rebuilt whenever the notes index changes.
 */
export function useNoteTreeNodes({ isTrashed, includedIds, hasRoot = false }: NoteTreeNodesOptions) {
  const { getNote, getChildIds } = useNotesContext();

  return useMemo<TreeNode<NoteMetadata>[]>(() => {
    const childrenByParentId = new Map<string | undefined, NoteMetadata[]>();
    const parentIds: (string | undefined)[] = [undefined];
    for (let index = 0; index < parentIds.length; index++) {
      const parentId = parentIds[index];
      const children = getChildIds(parentId, isTrashed)
        .filter((childId) => includedIds?.has(childId) ?? true)
        .map((childId) => getNote(childId))
        .filter((metadata) => metadata !== undefined);

      childrenByParentId.set(parentId, children);
      for (const child of children) {
        parentIds.push(child.id);
      }
    }

    const nodes = toNoteNodes(childrenByParentId, undefined);

    return hasRoot ? [toRootNode(nodes)] : nodes;
  }, [getNote, getChildIds, isTrashed, includedIds, hasRoot]);
}

function toNoteNodes(childrenByParentId: ChildrenByParentId, parentId: string | undefined): TreeNode<NoteMetadata>[] {
  return (childrenByParentId.get(parentId) ?? [])
    .toSorted(compareNotes)
    .map((metadata) => toTreeNode(metadata, toNoteNodes(childrenByParentId, metadata.id)));
}

function toRootNode(children: TreeNode<NoteMetadata>[]): TreeNode<NoteMetadata> {
  return {
    id: NOTES_ROOT_NODE_ID,
    label: NOTES_ROOT_LABEL,
    icon: FolderTree,
    iconClassName: FOLDER_ICON_CLASS,
    isExpandable: true,
    children,
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
