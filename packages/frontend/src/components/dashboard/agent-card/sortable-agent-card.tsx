import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { AgentCard } from "./agent-card.js";
import { AgentDragHandleContext } from "../context/agent-drag-handle-context.js";
import type { AgentDragHandleContextValue } from "../context/agent-drag-handle-context.types.js";
import { cn } from "../../../utils/cn.js";

interface SortableAgentCardProps {
  agent: AgentConfig;
  isBeingDragged: boolean;
  isDropTarget: boolean;
  onDragStart: (agentId: string) => void;
  onDragEnter: (agentId: string) => void;
  onDragLeave: (agentId: string) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/**
 * Wraps an agent card in native HTML5 drag-and-drop handlers. Only becomes
 * draggable while the user has pressed the grip handle inside the card
 * header, so the message input and other interactive elements keep their
 * normal pointer behavior.
 */
export function SortableAgentCard({
  agent,
  isBeingDragged,
  isDropTarget,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: SortableAgentCardProps) {
  const [isArmed, setIsArmed] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsArmed(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsArmed(false);
  }, []);

  // If the user presses the handle but releases outside the card (without
  // starting a drag), mouseup on the card won't fire. Listen on the window
  // so the armed state resets cleanly.
  useEffect(() => {
    if (!isArmed) {
      return;
    }

    const handleWindowMouseUp = () => setIsArmed(false);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, [isArmed]);

  const contextValue = useMemo<AgentDragHandleContextValue>(
    () => ({ onMouseDown: handleMouseDown, onMouseUp: handleMouseUp }),
    [handleMouseDown, handleMouseUp]
  );

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = "move";
      onDragStart(agent.id);
    },
    [agent.id, onDragStart]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDragEnter(agent.id);
    },
    [agent.id, onDragEnter]
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      // Native dragenter/dragleave bubble from descendants. Ignore leaves
      // that are really just transitions into a child node, otherwise the
      // drop-target ring strobes as the cursor passes over child elements.
      const related = event.relatedTarget;
      if (related instanceof Node && event.currentTarget.contains(related)) {
        return;
      }

      onDragLeave(agent.id);
    },
    [agent.id, onDragLeave]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDrop();
    },
    [onDrop]
  );

  const handleDragEnd = useCallback(() => {
    setIsArmed(false);
    onDragEnd();
  }, [onDragEnd]);

  return (
    <div
      draggable={isArmed}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      className={cn(
        "rounded-lg transition-opacity",
        isBeingDragged && "opacity-50",
        isDropTarget && "ring-1 ring-primary"
      )}
    >
      <AgentDragHandleContext.Provider value={contextValue}>
        <AgentCard agent={agent} />
      </AgentDragHandleContext.Provider>
    </div>
  );
}
