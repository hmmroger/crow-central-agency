import type { TreeRowAction } from "./tree-view.types.js";

interface TreeRowActionButtonProps<T> {
  action: TreeRowAction<T>;
  data: T;
  /** Name of the row, completing the button's accessible name */
  rowLabel: string;
  /** Only the tree's tab stop row puts its actions in the tab order */
  isTabbable: boolean;
}

export function TreeRowActionButton<T>({ action, data, rowLabel, isTabbable }: TreeRowActionButtonProps<T>) {
  const { icon: Icon, label, onSelect } = action;

  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} ${rowLabel}`}
      tabIndex={isTabbable ? 0 : -1}
      className="shrink-0 p-1 rounded-sm text-text-muted hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={() => onSelect(data)}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
