import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { canDragNode, getAncestorIds, getDropTarget, getVisibleNodes, toNodeRef } from "./tree-node-utils.js";
import { TreeNodeItem } from "./tree-node-item.js";
import type { TreeDropTarget, TreeNode, TreeNodeDragProps, TreeProps, VisibleTreeNode } from "./tree.types.js";

const ROOT_LEVEL = 1;
const HOVER_EXPAND_DELAY_MS = 600;
const DRAG_DATA_TYPE = "application/x-crow-tree-node";

/**
 * A domain-free tree. It owns expansion, focus and how they look; the consumer
 * supplies the nodes, the selection and what selecting or acting on a row means.
 */
export function Tree<T>({
  nodes,
  selectedId,
  revealId,
  defaultExpandedIds,
  actions,
  dragDrop,
  onSelect,
  ariaLabel,
}: TreeProps<T>) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set(defaultExpandedIds));
  const [focusedId, setFocusedId] = useState<string>();
  const [dragSourceId, setDragSourceId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<TreeDropTarget<T>>();
  const [hoverExpandId, setHoverExpandId] = useState<string>();
  const revealedIdRef = useRef<string>(undefined);
  const itemElementsRef = useRef(new Map<string, HTMLLIElement>());
  const visibleNodes = useMemo(() => getVisibleNodes(nodes, expandedIds), [nodes, expandedIds]);
  const tabStopId =
    [focusedId, selectedId].find((nodeId) => visibleNodes.some((visible) => visible.node.id === nodeId)) ??
    visibleNodes[0]?.node.id;

  // Each node is revealed once, so a node the user collapses afterwards stays
  // collapsed through later refreshes.
  useEffect(() => {
    if (revealId === undefined || revealId === revealedIdRef.current) {
      return;
    }

    // A just-created node arrives only with the refresh that follows it.
    const ancestorIds = getAncestorIds(nodes, revealId);
    if (!ancestorIds) {
      return;
    }

    revealedIdRef.current = revealId;
    if (ancestorIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const collapsedIds = ancestorIds.filter((ancestorId) => !current.has(ancestorId));
      if (collapsedIds.length === 0) {
        return current;
      }

      const next = new Set(current);
      for (const ancestorId of collapsedIds) {
        next.add(ancestorId);
      }

      return next;
    });
  }, [nodes, revealId]);

  const setExpanded = useCallback((nodeId: string, isExpanded: boolean) => {
    setExpandedIds((current) => {
      if (current.has(nodeId) === isExpanded) {
        return current;
      }

      const next = new Set(current);
      if (isExpanded) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }

      return next;
    });
  }, []);

  const focusNode = useCallback((nodeId: string | undefined) => {
    if (nodeId !== undefined) {
      itemElementsRef.current.get(nodeId)?.focus();
    }
  }, []);

  const handleRegister = useCallback((nodeId: string, element: HTMLLIElement | null) => {
    if (element) {
      itemElementsRef.current.set(nodeId, element);
    } else {
      itemElementsRef.current.delete(nodeId);
    }
  }, []);

  const handleActivate = useCallback(
    (node: TreeNode<T>) => {
      if (node.isExpandable) {
        setExpanded(node.id, !expandedIds.has(node.id));
      }

      onSelect(node.id, node.data);
    },
    [expandedIds, onSelect, setExpanded]
  );

  const handleKeyDown = useCallback(
    (node: TreeNode<T>, event: KeyboardEvent<HTMLLIElement>) => {
      const index = visibleNodes.findIndex((visible) => visible.node.id === node.id);
      const isExpanded = node.isExpandable && expandedIds.has(node.id);

      switch (event.key) {
        case "ArrowDown":
          focusNode(visibleNodes[index + 1]?.node.id);
          break;
        case "ArrowUp":
          focusNode(visibleNodes[index - 1]?.node.id);
          break;
        case "ArrowRight":
          if (node.isExpandable && !isExpanded) {
            setExpanded(node.id, true);
          } else {
            focusNode(isExpanded ? node.children[0]?.id : undefined);
          }

          break;
        case "ArrowLeft":
          if (isExpanded) {
            setExpanded(node.id, false);
          } else {
            focusNode(visibleNodes[index]?.parentId);
          }

          break;
        case "Home":
          focusNode(visibleNodes[0]?.node.id);
          break;
        case "End":
          focusNode(visibleNodes[visibleNodes.length - 1]?.node.id);
          break;
        case "Enter":
          onSelect(node.id, node.data);
          break;
        default:
          return;
      }

      event.preventDefault();
    },
    [visibleNodes, expandedIds, focusNode, setExpanded, onSelect]
  );

  const handleBlur = useCallback((event: FocusEvent<HTMLUListElement>) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setFocusedId(undefined);
    }
  }, []);

  useEffect(() => {
    if (hoverExpandId === undefined) {
      return;
    }

    const timeoutId = window.setTimeout(() => setExpanded(hoverExpandId, true), HOVER_EXPAND_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [hoverExpandId, setExpanded]);

  const hasDragDrop = dragDrop !== undefined;
  const visibleEntries = useMemo(
    () =>
      hasDragDrop
        ? new Map(visibleNodes.map((visible): [string, VisibleTreeNode<T>] => [visible.node.id, visible]))
        : undefined,
    [hasDragDrop, visibleNodes]
  );
  // A source row that unmounts mid-drag never fires dragend, so the drag only lives while its row is visible.
  const dragSource = dragSourceId === undefined ? undefined : visibleEntries?.get(dragSourceId)?.node;

  const endDrag = useCallback(() => {
    setDragSourceId(undefined);
    setDropTarget(undefined);
    setHoverExpandId(undefined);
  }, []);

  const handleDragStart = useCallback((node: TreeNode<T>, event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    // Firefox only starts a drag that carries data.
    event.dataTransfer.setData(DRAG_DATA_TYPE, node.id);
    setDragSourceId(node.id);
  }, []);

  const handleDragOver = useCallback(
    (node: TreeNode<T>, event: DragEvent<HTMLLIElement>) => {
      if (!dragDrop || !visibleEntries || !dragSource) {
        return;
      }

      event.stopPropagation();
      const isCollapsed = node.isExpandable && !expandedIds.has(node.id);
      setHoverExpandId(isCollapsed && node.id !== dragSource.id ? node.id : undefined);

      const target = getDropTarget(visibleEntries, dragDrop, toNodeRef(dragSource), node.id);
      setDropTarget((current) =>
        current?.node === target?.node && current?.isRedirected === target?.isRedirected ? current : target
      );
      if (target) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    },
    [dragDrop, visibleEntries, dragSource, expandedIds]
  );

  const handleDrop = useCallback(
    (node: TreeNode<T>, event: DragEvent<HTMLLIElement>) => {
      if (!dragDrop || !visibleEntries || !dragSource) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const source = toNodeRef(dragSource);
      const target = getDropTarget(visibleEntries, dragDrop, source, node.id);
      endDrag();
      if (target) {
        dragDrop.onDrop(source, toNodeRef(target.node));
      }
    },
    [dragDrop, visibleEntries, dragSource, endDrag]
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLUListElement>) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      setDropTarget(undefined);
      setHoverExpandId(undefined);
    }
  }, []);

  const drag = useMemo<TreeNodeDragProps<T> | undefined>(
    () =>
      dragDrop && {
        draggedId: dragSource?.id,
        dropTarget: dragSource && dropTarget,
        canDrag: (node) => canDragNode(dragDrop, node),
        onDragStart: handleDragStart,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        onDragEnd: endDrag,
      },
    [dragDrop, dragSource, dropTarget, handleDragStart, handleDragOver, handleDrop, endDrag]
  );

  return (
    <ul role="tree" aria-label={ariaLabel} onBlur={handleBlur} onDragLeave={drag && handleDragLeave}>
      {nodes.map((node) => (
        <TreeNodeItem
          key={node.id}
          node={node}
          level={ROOT_LEVEL}
          expandedIds={expandedIds}
          selectedId={selectedId}
          focusedId={focusedId}
          tabStopId={tabStopId}
          actions={actions}
          drag={drag}
          onActivate={handleActivate}
          onFocusNode={setFocusedId}
          onKeyDown={handleKeyDown}
          onRegister={handleRegister}
        />
      ))}
    </ul>
  );
}
