import { useCallback, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { AgentCard } from "./agent-card.js";
import { DashboardFilter } from "./dashboard-filter.js";
import { LoadingSkeleton } from "../common/loading-skeleton.js";
import { EmptyState } from "../common/empty-state.js";

/**
 * Dashboard — agent cards grid with stats bar, search filter, and empty state.
 * Owns its agent list query via useAgentsQuery.
 */
export function Dashboard() {
  const { data: agents = [], isLoading: loading, error, refetch } = useAgentsQuery();
  const openAgentEditor = useAppStore((state) => state.openAgentEditor);
  const [searchQuery, setSearchQuery] = useState("");
  const handleNewAgent = useCallback(() => openAgentEditor(), [openAgentEditor]);

  const headerActions = useMemo(
    () => [{ key: "new", label: "New Agent", icon: Plus, onClick: handleNewAgent, isPrimary: true }],
    [handleNewAgent]
  );

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

  const portal = <HeaderPortal title="Agents" actions={headerActions} />;

  if (loading) {
    return (
      <>
        {portal}
        <LoadingSkeleton lines={4} />
      </>
    );
  }

  if (error) {
    return (
      <>
        {portal}
        <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
          <p className="text-lg text-error">{error.message}</p>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </>
    );
  }

  if (agents.length === 0) {
    return (
      <>
        {portal}
        <EmptyState
          message="No agents yet"
          description="Create your first agent to get started."
          actionLabel="Create Agent"
          actionIcon={Plus}
          onAction={() => openAgentEditor()}
        />
      </>
    );
  }

  return (
    <div className="h-full p-6">
      {portal}

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
            {filteredAgents.map((agent, index) => (
              <div
                key={agent.id}
                className="animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <AgentCard agent={agent} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
