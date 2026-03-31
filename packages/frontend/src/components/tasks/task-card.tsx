import {
  AGENT_TASK_STATE,
  AGENT_TASK_SOURCE_TYPE,
  type AgentTaskItem,
  type AgentTaskState,
  type AgentTaskSource,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { Clock, User, Bot, RotateCw } from "lucide-react";
import { cn } from "../../utils/cn.js";
import { getTaskStateLabel, formatRelativeTime } from "../../utils/task-utils.js";
import { TaskActions } from "./task-actions.js";

interface TaskCardProps {
  task: AgentTaskItem;
  agents: AgentConfig[];
}

/** Left-edge accent color per task state */
const STATE_BORDER_COLOR: Record<AgentTaskState, string> = {
  [AGENT_TASK_STATE.OPEN]: "border-l-primary",
  [AGENT_TASK_STATE.ACTIVE]: "border-l-accent",
  [AGENT_TASK_STATE.COMPLETED]: "border-l-success",
  [AGENT_TASK_STATE.INCOMPLETE]: "border-l-warning",
  [AGENT_TASK_STATE.CLOSED]: "border-l-text-muted/40",
};

/** Badge background per task state */
const STATE_BADGE_STYLE: Record<AgentTaskState, string> = {
  [AGENT_TASK_STATE.OPEN]: "bg-primary/12 text-primary",
  [AGENT_TASK_STATE.ACTIVE]: "bg-accent/12 text-accent",
  [AGENT_TASK_STATE.COMPLETED]: "bg-success/12 text-success",
  [AGENT_TASK_STATE.INCOMPLETE]: "bg-warning/12 text-warning",
  [AGENT_TASK_STATE.CLOSED]: "bg-surface-elevated text-text-muted",
};

/**
 * Task card — compact panel with left-edge state indicator,
 * task content, metadata badges, and relative timestamps.
 */
export function TaskCard({ task, agents }: TaskCardProps) {
  const isClosed = task.state === AGENT_TASK_STATE.CLOSED;
  const isActive = task.state === AGENT_TASK_STATE.ACTIVE;

  /** Resolve an agent ID to display name, falling back to truncated ID */
  const resolveAgentName = (agentId: string): string => {
    const agent = agents.find((agentItem) => agentItem.id === agentId);

    return agent?.name ?? agentId.slice(0, 8);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 px-4 py-3",
        "rounded-lg border-l-[3px] border border-border-subtle/60",
        "bg-surface hover:bg-surface-elevated/60",
        "transition-all duration-[var(--duration-normal)]",
        "hover:border-border hover:shadow-card",
        STATE_BORDER_COLOR[task.state],
        isClosed && "opacity-50"
      )}
    >
      {/* Active glow effect */}
      {isActive && (
        <div className="absolute inset-0 rounded-lg pointer-events-none animate-pulse opacity-30 shadow-[inset_0_0_20px_var(--color-accent)/0.15]" />
      )}

      {/* Top row: state badge + timestamps */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-2xs font-medium tracking-wide uppercase",
              STATE_BADGE_STYLE[task.state]
            )}
          >
            {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
            {getTaskStateLabel(task.state)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Actions — visible on card hover */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-fast)]">
            <TaskActions task={task} />
          </div>

          <span className="text-3xs font-mono text-text-muted tabular-nums">
            {formatRelativeTime(task.updatedTimestamp)}
          </span>
        </div>
      </div>

      {/* Task content */}
      <p
        className={cn(
          "text-sm leading-relaxed",
          isClosed ? "text-text-muted line-through decoration-text-muted/30" : "text-text-primary"
        )}
      >
        {task.task}
      </p>

      {/* Metadata row: source + owner */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Origin source */}
        <SourceBadge label="From" source={task.originateSource} resolveAgentName={resolveAgentName} />

        {/* Owner (assigned agent) */}
        {task.ownerSource && (
          <SourceBadge label="Owner" source={task.ownerSource} resolveAgentName={resolveAgentName} />
        )}

        {/* Created time — only show if different from updated */}
        {task.createdTimestamp !== task.updatedTimestamp && (
          <span className="flex items-center gap-1 text-3xs text-text-muted font-mono">
            <Clock className="w-3 h-3" />
            created {formatRelativeTime(task.createdTimestamp)}
          </span>
        )}
      </div>
    </div>
  );
}

/** Small metadata badge showing source type + name */
function SourceBadge({
  label,
  source,
  resolveAgentName,
}: {
  label: string;
  source: AgentTaskSource;
  resolveAgentName: (id: string) => string;
}) {
  const isAgent = source.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT;
  const isLoop = source.sourceType === AGENT_TASK_SOURCE_TYPE.LOOP;

  const Icon = isAgent ? Bot : isLoop ? RotateCw : User;
  const name = isAgent ? resolveAgentName(source.agentId) : isLoop ? "Loop" : "User";

  return (
    <span className="flex items-center gap-1.5 text-3xs text-text-muted">
      <span className="text-text-muted/60">{label}:</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-surface-elevated/80 text-text-secondary font-medium">
        <Icon className="w-3 h-3" />
        {name}
      </span>
    </span>
  );
}
