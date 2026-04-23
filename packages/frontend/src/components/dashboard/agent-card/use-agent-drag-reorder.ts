import { useCallback, useState } from "react";

interface UseAgentDragReorderOptions {
  /** Agent ids currently rendered in the section, in display order. */
  orderedAgentIds: string[];
  /** Called with the new ordered id array when a successful drop reorders. */
  onReorder: (nextOrderedIds: string[]) => void;
}

interface UseAgentDragReorderReturn {
  draggedId: string | undefined;
  dropTargetId: string | undefined;
  handleDragStart: (agentId: string) => void;
  handleDragEnter: (agentId: string) => void;
  handleDragLeave: (agentId: string) => void;
  handleDrop: () => void;
  handleDragEnd: () => void;
}

/**
 * Transient drag-and-drop state for reordering agent cards inside a single
 * dashboard section (circle, pinned, etc.). Computes the new ordered id
 * array on drop and invokes `onReorder`. Does not persist anything itself —
 * the caller decides what to do with the new order (typically: push it into
 * the dashboard settings mutation).
 */
export function useAgentDragReorder({
  orderedAgentIds,
  onReorder,
}: UseAgentDragReorderOptions): UseAgentDragReorderReturn {
  const [draggedId, setDraggedId] = useState<string | undefined>(undefined);
  const [dropTargetId, setDropTargetId] = useState<string | undefined>(undefined);

  const handleDragStart = useCallback((agentId: string) => {
    setDraggedId(agentId);
  }, []);

  const handleDragEnter = useCallback((agentId: string) => {
    setDropTargetId(agentId);
  }, []);

  const handleDragLeave = useCallback((agentId: string) => {
    setDropTargetId((current) => (current === agentId ? undefined : current));
  }, []);

  const resetState = useCallback(() => {
    setDraggedId(undefined);
    setDropTargetId(undefined);
  }, []);

  const handleDrop = useCallback(() => {
    if (draggedId === undefined || dropTargetId === undefined || draggedId === dropTargetId) {
      resetState();
      return;
    }

    const fromIndex = orderedAgentIds.indexOf(draggedId);
    const toIndex = orderedAgentIds.indexOf(dropTargetId);
    if (fromIndex < 0 || toIndex < 0) {
      resetState();
      return;
    }

    // Drop-on-target semantics: the dragged card lands in the target's
    // original slot, pushing the target one step in the direction opposite
    // of the drag. After splicing the source out, inserting at the original
    // toIndex achieves this for both forward and backward drags.
    const next = [...orderedAgentIds];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, draggedId);
    onReorder(next);
    resetState();
  }, [draggedId, dropTargetId, orderedAgentIds, onReorder, resetState]);

  const handleDragEnd = useCallback(() => {
    resetState();
  }, [resetState]);

  return {
    draggedId,
    dropTargetId,
    handleDragStart,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
  };
}
