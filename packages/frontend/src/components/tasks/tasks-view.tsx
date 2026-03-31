import { Plus, RefreshCw } from "lucide-react";
import { useTasksContext } from "../../providers/tasks-provider.js";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ActionBarButton } from "../common/action-bar-button.js";
import { LoadingSkeleton } from "../common/loading-skeleton.js";
import { EmptyState } from "../common/empty-state.js";
import { TaskList } from "./task-list.js";

/**
 * Tasks view — top-level view for task management.
 * Consumes global task data from TasksProvider.
 */
export function TasksView() {
  const { tasks, isLoading, error } = useTasksContext();
  const { data: agents = [] } = useAgentsQuery();

  if (isLoading) {
    return (
      <>
        <HeaderPortal title="Tasks" />
        <LoadingSkeleton lines={6} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <HeaderPortal title="Tasks" />
        <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
          <p className="text-lg text-error">{error.message}</p>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </>
    );
  }

  if (tasks.length === 0) {
    return (
      <>
        <HeaderPortal title="Tasks" />
        <EmptyState
          message="No tasks yet"
          description="Create a task or let agents delegate work to each other."
          actionLabel="New Task"
          actionIcon={Plus}
          onAction={() => {
            /* TODO: Phase 5 — open create task dialog */
          }}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Tasks" />

      {/* Header row with task count + new task button */}
      <div className="flex items-center justify-between px-6 pt-4 pb-2">
        <span className="text-xs text-text-muted font-mono tabular-nums">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
        <ActionBarButton
          icon={Plus}
          label="New Task"
          onClick={() => {
            /* TODO: Phase 5 — open create task dialog */
          }}
          isPrimary
        />
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <TaskList tasks={tasks} agents={agents} />
      </div>
    </div>
  );
}
