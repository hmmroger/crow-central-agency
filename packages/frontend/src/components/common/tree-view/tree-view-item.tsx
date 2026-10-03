import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { TreeRowActionButton } from "./tree-row-action-button.js";
import type { TreeNode, TreeRowAction } from "./tree-view.types.js";

interface TreeViewItemProps<T> {
  node: TreeNode<T>;
  level: number;
  expandedIds: ReadonlySet<string>;
  selectedId?: string;
  focusedId?: string;
  tabStopId?: string;
  actions?: readonly TreeRowAction<T>[];
  onActivate: (node: TreeNode<T>) => void;
  onFocusNode: (nodeId: string) => void;
  onKeyDown: (node: TreeNode<T>, event: KeyboardEvent<HTMLLIElement>) => void;
  onRegister: (nodeId: string, element: HTMLLIElement | null) => void;
}

export function TreeViewItem<T>({
  node,
  level,
  expandedIds,
  selectedId,
  focusedId,
  tabStopId,
  actions,
  onActivate,
  onFocusNode,
  onKeyDown,
  onRegister,
}: TreeViewItemProps<T>) {
  const isExpanded = node.isExpandable && expandedIds.has(node.id);
  const isSelected = node.id === selectedId;
  const isTabStop = node.id === tabStopId;
  const Icon = isExpanded && node.expandedIcon ? node.expandedIcon : node.icon;
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  const availableActions = actions?.filter((action) => action.isAvailable?.(node.data) ?? true) ?? [];
  const rowRef = useRef<HTMLDivElement>(null);
  const registerElement = useCallback(
    (element: HTMLLIElement | null) => onRegister(node.id, element),
    [onRegister, node.id]
  );

  // The row only mounts once its ancestors are expanded, so a selection restored
  // into a collapsed branch scrolls as soon as the reveal unfolds it.
  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const handleFocus = (event: FocusEvent<HTMLLIElement>) => {
    if (event.target === event.currentTarget) {
      onFocusNode(node.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target === event.currentTarget) {
      onKeyDown(node, event);
    }
  };

  return (
    <li
      role="treeitem"
      aria-level={level}
      aria-selected={isSelected}
      aria-expanded={node.isExpandable ? isExpanded : undefined}
      tabIndex={isTabStop ? 0 : -1}
      className="outline-none"
      ref={registerElement}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={rowRef}
        className={cn(
          "group flex items-center rounded-sm pr-1 transition-colors [li:focus-visible>&]:ring-2 [li:focus-visible>&]:ring-primary/40",
          isSelected ? "bg-surface-accent" : "hover:bg-surface-hover"
        )}
      >
        <div
          className={cn(
            "flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 text-sm cursor-pointer",
            isSelected ? "text-text-base" : "text-text-neutral"
          )}
          onClick={() => onActivate(node)}
        >
          {node.isExpandable ? (
            <Chevron className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0 text-text-muted", node.iconClassName)} />}
          <span className="truncate">{node.label}</span>
        </div>

        {availableActions.length > 0 && (
          <div
            className={cn(
              "flex shrink-0 transition-opacity",
              node.id === focusedId ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          >
            {availableActions.map((action) => (
              <TreeRowActionButton
                key={action.id}
                action={action}
                data={node.data}
                rowLabel={node.label}
                isTabbable={isTabStop}
              />
            ))}
          </div>
        )}
      </div>

      {isExpanded && node.children.length > 0 && (
        <ul role="group" className="pl-3">
          {node.children.map((child) => (
            <TreeViewItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              focusedId={focusedId}
              tabStopId={tabStopId}
              actions={actions}
              onActivate={onActivate}
              onFocusNode={onFocusNode}
              onKeyDown={onKeyDown}
              onRegister={onRegister}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
