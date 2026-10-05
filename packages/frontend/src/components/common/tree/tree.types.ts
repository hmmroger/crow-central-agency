import type { ComponentType } from "react";

export type TreeIcon = ComponentType<{ className?: string }>;

export interface TreeNode<T = undefined> {
  id: string;
  label: string;
  icon?: TreeIcon;
  /** Shown instead of `icon` while an expandable node is expanded */
  expandedIcon?: TreeIcon;
  /** Theme-token classes for whichever icon is shown */
  iconClassName?: string;
  /** Whether the node can be expanded, however many children it has now */
  isExpandable: boolean;
  children: TreeNode<T>[];
  data?: T;
}

/** A control rendered at the end of a node's row, for acting on that node */
export interface TreeNodeAction<T = undefined> {
  id: string;
  /** Tooltip text; also the prefix of the button's accessible name */
  label: string;
  icon: TreeIcon;
  /** Nodes this action does not apply to render no button */
  isAvailable?: (id: string, data?: T) => boolean;
  onSelect: (id: string, data?: T) => void;
}

export interface TreeProps<T = undefined> {
  /** Root nodes, already in display order */
  nodes: TreeNode<T>[];
  selectedId?: string;
  /** Node to bring into view: its ancestors are expanded once per id */
  revealId?: string;
  /** Nodes expanded on mount */
  defaultExpandedIds?: readonly string[];
  actions?: readonly TreeNodeAction<T>[];
  onSelect: (id: string, data?: T) => void;
  ariaLabel: string;
}

/** A node as currently shown, in display order */
export interface VisibleTreeNode<T> {
  node: TreeNode<T>;
  parentId?: string;
}
