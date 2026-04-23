import { useState, type KeyboardEvent } from "react";
import { Plus, CircleDot, Zap, ExternalLink } from "lucide-react";
import { AGENT_TASK_STATE, type AgentTaskItem } from "@crow-central-agency/shared";
import { useCreateTask } from "../../hooks/queries/use-task-mutations.js";
import { useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { cn } from "../../utils/cn.js";
import { DashboardWidget } from "./dashboard-widget.js";

interface TaskRowProps {
  task: AgentTaskItem;
}

interface TasksWidgetProps {
  tasks: AgentTaskItem[];
  className?: string;
}

/**
 * Compact tasks widget for the dashboard.
 * Shows open and active tasks with inline task creation.
 */
export function TasksWidget({ tasks, className }: TasksWidgetProps) {
  const [inputValue, setInputValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const createTask = useCreateTask();
  const setViewMode = useAppStore((state) => state.setViewMode);

  const pendingTasks = tasks
    .filter((task) => task.state === AGENT_TASK_STATE.OPEN)
    .sort((taskA, taskB) => taskB.createdTimestamp - taskA.createdTimestamp);

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || createTask.isPending) {
      return;
    }

    try {
      await createTask.mutateAsync({
        task: trimmed,
      });
      setInputValue("");
    } catch {
      // Error shown inline
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const expandAction = (
    <button
      type="button"
      className="flex items-center gap-1 text-3xs text-text-muted hover:text-text-base transition-colors"
      onClick={() => setViewMode(VIEW_MODE.TASKS)}
      title="Open tasks view"
    >
      <ExternalLink className="h-3 w-3" />
    </button>
  );

  return (
    <DashboardWidget
      title="Open Tasks"
      badge={pendingTasks.length > 0 ? pendingTasks.length : undefined}
      action={expandAction}
      className={className}
    >
      {/* Inline task input */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsExpanded(true)}
            onBlur={() => {
              if (!inputValue.trim()) {
                setIsExpanded(false);
              }
            }}
            placeholder="Add a task..."
            className="w-full px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
          />
        </div>
        {isExpanded && (
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors disabled:opacity-40"
            onClick={() => void handleSubmit()}
            disabled={!inputValue.trim() || createTask.isPending}
            title="Create task"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {createTask.error && <p className="text-3xs text-error mb-2">{createTask.error.message}</p>}

      {/* Task list */}
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
        {pendingTasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
        {pendingTasks.length === 0 && <p className="text-3xs text-text-muted py-2 text-center">No pending tasks</p>}
      </div>
    </DashboardWidget>
  );
}

function TaskRow({ task }: TaskRowProps) {
  const isActive = task.state === AGENT_TASK_STATE.ACTIVE;

  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-surface-elevated/50 transition-colors">
      {isActive ? (
        <Zap className="h-3 w-3 mt-0.5 shrink-0 text-accent" />
      ) : (
        <CircleDot className="h-3 w-3 mt-0.5 shrink-0 text-primary" />
      )}
      <span className={cn("text-xs leading-tight line-clamp-2", isActive ? "text-text-base" : "text-text-neutral")}>
        {task.task}
      </span>
    </div>
  );
}
