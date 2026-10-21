import type { TreeDragDrop, TreeDropTarget, TreeNode, TreeNodeRef, VisibleTreeNode } from "./tree.types.js";

export function toNodeRef<T>(node: TreeNode<T>): TreeNodeRef<T> {
  return { id: node.id, data: node.data };
}

export function canDragNode<T>(dragDrop: TreeDragDrop<T>, node: TreeNode<T>): boolean {
  return dragDrop.canDrag?.(toNodeRef(node)) ?? true;
}

/** The row a drop over `hoveredId` lands on; undefined when that row resolves to no target. */
export function resolveDropTarget<T>(
  entries: ReadonlyMap<string, VisibleTreeNode<T>>,
  hoveredId: string,
  isLeafRedirected: boolean
): TreeDropTarget<T> | undefined {
  const hovered = entries.get(hoveredId);
  if (!hovered) {
    return undefined;
  }

  if (!isLeafRedirected || hovered.node.isExpandable) {
    return { node: hovered.node, isRedirected: false };
  }

  const parent = hovered.parentId === undefined ? undefined : entries.get(hovered.parentId);
  return parent && { node: parent.node, isRedirected: true };
}

export function isSelfOrDescendant<T>(
  entries: ReadonlyMap<string, VisibleTreeNode<T>>,
  ancestorId: string,
  nodeId: string
): boolean {
  let currentId: string | undefined = nodeId;
  while (currentId !== undefined) {
    if (currentId === ancestorId) {
      return true;
    }

    currentId = entries.get(currentId)?.parentId;
  }

  return false;
}

/** The resolved target for dropping `source` over `hoveredId`, when the drop is allowed. */
export function getDropTarget<T>(
  entries: ReadonlyMap<string, VisibleTreeNode<T>>,
  dragDrop: TreeDragDrop<T>,
  source: TreeNodeRef<T>,
  hoveredId: string
): TreeDropTarget<T> | undefined {
  const target = resolveDropTarget(entries, hoveredId, dragDrop.isLeafRedirected ?? false);
  if (!target || isSelfOrDescendant(entries, source.id, target.node.id)) {
    return undefined;
  }

  return dragDrop.canDrop(source, toNodeRef(target.node)) ? target : undefined;
}

/** Ids of every ancestor of `nodeId`, root first; undefined when the node is not in the tree. */
export function getAncestorIds<T>(nodes: TreeNode<T>[], nodeId: string): string[] | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return [];
    }

    const ancestorIds = getAncestorIds(node.children, nodeId);
    if (ancestorIds) {
      return [node.id].concat(ancestorIds);
    }
  }

  return undefined;
}

/** The nodes a reader sees, in display order: every root, and the children of expanded nodes. */
export function getVisibleNodes<T>(
  nodes: TreeNode<T>[],
  expandedIds: ReadonlySet<string>,
  parentId?: string,
  visibleNodes: VisibleTreeNode<T>[] = []
): VisibleTreeNode<T>[] {
  for (const node of nodes) {
    visibleNodes.push({ node, parentId });

    if (node.isExpandable && expandedIds.has(node.id)) {
      getVisibleNodes(node.children, expandedIds, node.id, visibleNodes);
    }
  }

  return visibleNodes;
}
