import { Plus, RefreshCw } from "lucide-react";
import { useAppStore } from "../../stores/app-store.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { useTasksContext } from "../../providers/tasks-provider.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ActionBarButton } from "../common/action-bar-button.js";
import { AgentCard } from "./agent-card.js";
import { TaskStatsBar } from "./task-stats-bar.js";
import { LoadingSkeleton } from "../common/loading-skeleton.js";
import { EmptyState } from "../common/empty-state.js";

/**
 * Dashboard - agent cards grid with inline "New Agent" button.
 * Owns its agent list query via useAgentsQuery.
 */
export function Dashboard() {
  const { data: agents = [], isLoading: loading, error, refetch } = useAgentsQuery();
  const { tasks } = useTasksContext();
  const openAgentEditor = useAppStore((state) => state.openAgentEditor);

  if (loading) {
    return (
      <>
        <HeaderPortal title="Dashboard" />
        <LoadingSkeleton lines={4} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <HeaderPortal title="Dashboard" />
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
        <HeaderPortal title="Dashboard" />
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
      <HeaderPortal title="Dashboard" />

      {/* Task stats bar — live-updating from TasksProvider */}
      <TaskStatsBar tasks={tasks} />

      {/* Header row with New Agent button */}
      <div className="flex items-center justify-end px-6 pt-4 pb-2">
        <ActionBarButton icon={Plus} label="New Agent" onClick={() => openAgentEditor()} isPrimary />
      </div>

      {/* Agent cards grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((agent, index) => (
            <div
              key={agent.id}
              className="animate-[fade-slide-up_var(--duration-normal)_var(--ease-out)_both]"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <AgentCard agent={agent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
