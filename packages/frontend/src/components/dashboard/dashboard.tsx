import { useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { AgentCard } from "./agent-card.js";
import { DashboardStatsBar } from "./dashboard-stats-bar.js";
import { DashboardFilter } from "./dashboard-filter.js";
import { LoadingSkeleton } from "../common/loading-skeleton.js";
import { EmptyState } from "../common/empty-state.js";

interface DashboardProps {
  agents: AgentConfig[];
  loading: boolean;
  error?: string;
  refetch: () => void;
}

/**
 * Dashboard — agent cards grid with stats bar, search filter, and empty state.
 * Receives agent data from AppContent (single useAgents() call).
 */
export function Dashboard({ agents, loading, error, refetch }: DashboardProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) {
      return agents;
    }

    const query = searchQuery.toLowerCase();

    return agents.filter(
      (agent) => agent.name.toLowerCase().includes(query) || agent.description.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  if (loading) {
    return <LoadingSkeleton lines={4} />;
  }

  if (error) {
    return (
      <EmptyState
        message={error}
        action={
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        }
      />
    );
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        message="No agents yet"
        description="Create your first agent to get started."
        action={
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-text-primary font-medium hover:opacity-90 transition-opacity"
            onClick={() => goToAgentEditor()}
          >
            <Plus className="h-4 w-4" />
            Create Agent
          </button>
        }
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header row — title, stats, filter, new button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-text-primary">Agents</h2>
          <DashboardStatsBar agents={agents} />
        </div>
        <div className="flex items-center gap-3">
          <DashboardFilter searchQuery={searchQuery} onSearchChange={setSearchQuery} />
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => goToAgentEditor()}
          >
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </button>
        </div>
      </div>

      {/* Agent cards grid */}
      {filteredAgents.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-text-muted text-sm">
          No agents match &quot;{searchQuery}&quot;
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
