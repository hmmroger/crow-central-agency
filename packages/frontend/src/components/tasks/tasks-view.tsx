import { useState, useMemo } from "react";
import { AGENT_TASK_STATE, type AgentTaskItem, type AgentTaskState } from "@crow-central-agency/shared";
import { Plus, RefreshCw, List, CircleDot, Zap, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useTasksContext } from "../../providers/tasks-provider.js";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { EmptyState } from "../common/empty-state.js";
import { TabBar, type TabDefinition } from "../common/tab-bar.js";
import { TaskList } from "./task-list.js";
import { CreateTaskDialog } from "./create-task-dialog.js";
import { useAppStore } from "../../stores/app-store.js";

/** Filter tab IDs */
const TASK_FILTER = {
  ALL: "all",
  OPEN: "open",
  ACTIVE: "active",
  COMPLETED: "completed",
  INCOMPLETE: "incomplete",
  CLOSED: "closed",
} as const;

type TaskFilter = (typeof TASK_FILTER)[keyof typeof TASK_FILTER];

/** Tab definitions for task filtering */
const FILTER_TABS: TabDefinition<TaskFilter>[] = [
  { id: TASK_FILTER.ALL, label: "All", icon: List },
  { id: TASK_FILTER.OPEN, label: "Open", icon: CircleDot },
  { id: TASK_FILTER.ACTIVE, label: "Active", icon: Zap },
  { id: TASK_FILTER.COMPLETED, label: "Done", icon: CheckCircle2 },
  { id: TASK_FILTER.INCOMPLETE, label: "Incomplete", icon: AlertTriangle },
  { id: TASK_FILTER.CLOSED, label: "Closed", icon: XCircle },
];

/** Map filter ID to task state (ALL maps to undefined = no filter) */
const FILTER_TO_STATE: Record<TaskFilter, AgentTaskState | undefined> = {
  [TASK_FILTER.ALL]: undefined,
  [TASK_FILTER.OPEN]: AGENT_TASK_STATE.OPEN,
  [TASK_FILTER.ACTIVE]: AGENT_TASK_STATE.ACTIVE,
  [TASK_FILTER.COMPLETED]: AGENT_TASK_STATE.COMPLETED,
  [TASK_FILTER.INCOMPLETE]: AGENT_TASK_STATE.INCOMPLETE,
  [TASK_FILTER.CLOSED]: AGENT_TASK_STATE.CLOSED,
};

/** Reverse map from task state to filter ID */
const STATE_TO_FILTER: Record<AgentTaskState, TaskFilter> = {
  [AGENT_TASK_STATE.OPEN]: TASK_FILTER.OPEN,
  [AGENT_TASK_STATE.ACTIVE]: TASK_FILTER.ACTIVE,
  [AGENT_TASK_STATE.COMPLETED]: TASK_FILTER.COMPLETED,
  [AGENT_TASK_STATE.INCOMPLETE]: TASK_FILTER.INCOMPLETE,
  [AGENT_TASK_STATE.CLOSED]: TASK_FILTER.CLOSED,
};

/** Per-filter empty state messages */
const FILTER_EMPTY_MESSAGES: Record<TaskFilter, string> = {
  [TASK_FILTER.ALL]: "No tasks yet",
  [TASK_FILTER.OPEN]: "No open tasks",
  [TASK_FILTER.ACTIVE]: "No active tasks",
  [TASK_FILTER.COMPLETED]: "No completed tasks",
  [TASK_FILTER.INCOMPLETE]: "No incomplete tasks",
  [TASK_FILTER.CLOSED]: "No closed tasks",
};

/** Filter tasks by the selected tab */
function filterTasks(tasks: AgentTaskItem[], filter: TaskFilter): AgentTaskItem[] {
  const targetState = FILTER_TO_STATE[filter];

  if (targetState === undefined) {
    return tasks;
  }

  return tasks.filter((task) => task.state === targetState);
}

/**
 * Tasks view — top-level view for task management.
 * Consumes global task data from TasksProvider.
 */
export function TasksView() {
  const { tasks, isLoading, error, refetch } = useTasksContext();
  const { agents } = useAgentsContext();
  const { showDialog } = useModalDialog();
  const [activeFilter, setActiveFilter] = useState<TaskFilter>(() => {
    const filter = useAppStore.getState().initialTaskFilter;
    if (filter) {
      useAppStore.getState().clearInitialTaskFilter();

      return STATE_TO_FILTER[filter];
    }

    return TASK_FILTER.ALL;
  });

  const filteredTasks = useMemo(() => filterTasks(tasks, activeFilter), [tasks, activeFilter]);

  const openCreateDialog = () => {
    showDialog({
      id: "create-task",
      component: CreateTaskDialog,
      title: "New Task",
      className: "w-fit",
    });
  };

  if (isLoading) {
    return (
      <>
        <HeaderPortal title="Tasks" />
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-base text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={refetch}
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
          onAction={openCreateDialog}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Tasks" />

      {/* Header row with filter tabs + new task button */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1">
        <TabBar tabs={FILTER_TABS} activeTab={activeFilter} onTabChange={setActiveFilter} layoutId="taskFilter" />
        <ActionButton
          icon={Plus}
          label="New Task"
          onClick={openCreateDialog}
          variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
        />
      </div>

      {/* Task count */}
      <div className="px-6 pb-2">
        <span className="text-3xs text-text-muted font-mono tabular-nums">
          {filteredTasks.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Task list or empty state for filter */}
      {filteredTasks.length > 0 ? (
        <TaskList tasks={filteredTasks} agents={agents} />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <EmptyState message={FILTER_EMPTY_MESSAGES[activeFilter]} className="h-48" />
        </div>
      )}
    </div>
  );
}
