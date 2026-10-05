import type { TreeNode, TreeNodeAction } from "./tree.types.js";

interface TreeNodeActionButtonProps<T> {
  action: TreeNodeAction<T>;
  node: TreeNode<T>;
  /** Only the tree's tab stop node puts its actions in the tab order */
  isTabbable: boolean;
}

export function TreeNodeActionButton<T>({ action, node, isTabbable }: TreeNodeActionButtonProps<T>) {
  const { icon: Icon, label, onSelect } = action;

  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} ${node.label}`}
      tabIndex={isTabbable ? 0 : -1}
      className="shrink-0 p-1 rounded-sm text-text-muted hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onSelect(node.id, node.data)}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
