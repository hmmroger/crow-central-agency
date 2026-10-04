import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { getAncestorIds, getVisibleNodes } from "./tree-node-utils.js";
import { TreeNodeItem } from "./tree-node-item.js";
import type { TreeNode, TreeProps } from "./tree.types.js";

const ROOT_LEVEL = 1;

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
  onSelect,
  ariaLabel,
}: TreeProps<T>) {
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set(defaultExpandedIds));
  const [focusedId, setFocusedId] = useState<string>();
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

  return (
    <ul role="tree" aria-label={ariaLabel} onBlur={handleBlur}>
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
          onActivate={handleActivate}
          onFocusNode={setFocusedId}
          onKeyDown={handleKeyDown}
          onRegister={handleRegister}
        />
      ))}
    </ul>
  );
}
