import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { useHeader } from "../../hooks/use-header.js";
import { AgentCard } from "./agent-card.js";
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
  const { setTitle, setActions } = useHeader();
  const handleNewAgent = useCallback(() => goToAgentEditor(), [goToAgentEditor]);

  useEffect(() => {
    setTitle("Agents");
  }, [setTitle]);

  const headerActions = useMemo(
    () => [{ key: "new", label: "New Agent", icon: Plus, onClick: handleNewAgent, isPrimary: true }],
    [handleNewAgent]
  );

  useEffect(() => {
    setActions(headerActions);
  }, [setActions, headerActions]);

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
      <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
        <p className="text-lg text-error">{error}</p>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        message="No agents yet"
        description="Create your first agent to get started."
        actionLabel="Create Agent"
        actionIcon={Plus}
        onAction={() => goToAgentEditor()}
      />
    );
  }

  return (
    <div className="h-full p-6">
      {/* Filter bar */}
      <div className="flex items-center justify-end mb-4">
        <DashboardFilter searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      </div>

      {/* Agent cards grid */}
      <div className="overflow-y-auto h-full">
        {filteredAgents.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">
            No agents match &quot;{searchQuery}&quot;
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
