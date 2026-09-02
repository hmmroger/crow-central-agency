import { useMemo, useState } from "react";
import { useAgentsContext } from "../../providers/agents-provider.js";

interface ScheduleAgentSelectProps {
  /** Ids of the agents the schedule targets */
  selectedAgentIds: string[];
  /** Fired when the user toggles an agent's selection */
  onToggle: (agentId: string) => void;
  /** Text shown when no agents exist */
  emptyText?: string;
}

/**
 * Filterable, scrollable, bounded checkbox list of agents a schedule can target.
 * Renders its own content only — the caller owns the surrounding label / layout.
 */
export function ScheduleAgentSelect({
  selectedAgentIds,
  onToggle,
  emptyText = "No agents available.",
}: ScheduleAgentSelectProps) {
  const { agents, isLoading } = useAgentsContext();
  const [filter, setFilter] = useState("");

  const filteredAgents = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return agents;
    }

    return agents.filter((agent) => agent.name.toLowerCase().includes(needle));
  }, [agents, filter]);

  if (isLoading || agents.length === 0) {
    return <p className="text-xs text-text-muted">{isLoading ? "Loading agents..." : emptyText}</p>;
  }

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by name..."
        aria-label="Filter agents by name"
        className="w-full mb-1.5 px-2 py-1 rounded border border-border-subtle bg-surface-inset text-xs text-text-base placeholder:text-text-muted focus:outline-none focus:border-border-focus"
      />
      <div className="max-h-48 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2">
        {filteredAgents.length === 0 ? (
          <p className="text-xs text-text-muted">No agents match the filter.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredAgents.map((agent) => (
              <label key={agent.id} className="flex items-center gap-2 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={selectedAgentIds.includes(agent.id)}
                  onChange={() => onToggle(agent.id)}
                  className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0"
                />
                <span className="text-xs text-text-neutral truncate">{agent.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <p className="text-3xs text-text-muted mt-1">
        {selectedAgentIds.length} / {agents.length} selected
      </p>
    </div>
  );
}
