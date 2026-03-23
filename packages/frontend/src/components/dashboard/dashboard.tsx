import type { AgentConfig } from "@crow-central-agency/shared";
import { useAppStore } from "../../stores/app-store.js";
import { AgentCard } from "./agent-card.js";

interface DashboardProps {
  agents: AgentConfig[];
  loading: boolean;
  error?: string;
  refetch: () => void;
}

/**
 * Dashboard — agent cards grid with empty state.
 * Receives agent data from AppContent (single useAgents() call).
 * Phase 4 will add stats bar, filtering, mini-consoles.
 */
export function Dashboard({ agents, loading, error, refetch }: DashboardProps) {
  const goToAgentEditor = useAppStore((state) => state.goToAgentEditor);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-text-muted">Loading agents...</div>;
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
        <p className="text-error">{error}</p>
        <button
          className="px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
        <p className="text-lg">No agents yet</p>
        <p className="text-sm">Create your first agent to get started.</p>
        <button
          className="px-4 py-2 rounded-md bg-primary text-text-primary font-medium hover:opacity-90 transition-opacity"
          onClick={() => goToAgentEditor()}
        >
          Create Agent
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-text-primary">Agents ({agents.length})</h2>
        <button
          className="px-3 py-1.5 rounded-md bg-primary text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={() => goToAgentEditor()}
        >
          + New Agent
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
