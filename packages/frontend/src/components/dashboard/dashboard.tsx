import { useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ActionBar, ActionBarButton } from "../layout/action-bar.js";
import { AgentCard } from "./agent-card.js";
import { DashboardFilter } from "./dashboard-filter.js";
import { LoadingSkeleton } from "../common/loading-skeleton.js";
import { EmptyState } from "../common/empty-state.js";

/**
 * Dashboard — agent cards grid with action bar, search filter, and empty state.
 * Owns its agent list query via useAgentsQuery.
 */
export function Dashboard() {
  const { data: agents = [], isLoading: loading, error, refetch } = useAgentsQuery();
  const openAgentEditor = useAppStore((state) => state.openAgentEditor);
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

  const portal = <HeaderPortal title="Dashboard" />;

  const actionBar = (
    <ActionBar
      left={
        agents.length > 0 ? (
          <span>
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
      right={<ActionBarButton icon={Plus} label="New Agent" onClick={() => openAgentEditor()} isPrimary />}
    />
  );

  if (loading) {
    return (
      <>
        {portal}
        {actionBar}
        <LoadingSkeleton lines={4} />
      </>
    );
  }

  if (error) {
    return (
      <>
        {portal}
        {actionBar}
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
        {actionBar}
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
    <div className="flex flex-col h-full">
      {portal}
      {actionBar}

      {/* Filter bar */}
      <div className="flex items-center justify-end px-6 pt-4 pb-2">
        <DashboardFilter searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      </div>

      {/* Agent cards grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
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
