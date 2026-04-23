import { useMemo } from "react";
import { Pin } from "lucide-react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { SortableAgentCard } from "./agent-card/sortable-agent-card.js";
import { useAgentDragReorder } from "./agent-card/use-agent-drag-reorder.js";

interface PinnedSectionProps {
  agents: AgentConfig[];
  onReorder: (orderedAgentIds: string[]) => void;
}

/**
 * Dashboard section showing pinned agents.
 * Only renders when there are pinned agents.
 */
export function PinnedSection({ agents, onReorder }: PinnedSectionProps) {
  const orderedAgentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);

  const { draggedId, dropTargetId, handleDragStart, handleDragEnter, handleDragLeave, handleDrop, handleDragEnd } =
    useAgentDragReorder({ orderedAgentIds, onReorder });

  if (agents.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 px-6 pt-5 pb-3">
        <Pin className="h-3 w-3 text-text-muted" />
        <h3 className="text-2xs font-medium uppercase tracking-widest text-text-muted">Pinned</h3>
        <span className="text-2xs text-text-muted/60">{agents.length}</span>
      </div>

      <div className="px-6 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent, index) => (
            <div key={agent.id} className="animate-fade-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
              <SortableAgentCard
                agent={agent}
                isBeingDragged={draggedId === agent.id}
                isDropTarget={dropTargetId === agent.id && draggedId !== undefined && draggedId !== agent.id}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
