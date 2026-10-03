import type { TreeNode, VisibleTreeNode } from "./tree-view.types.js";

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
