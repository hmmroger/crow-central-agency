import {
  AGENT_TASK_STATE,
  AGENT_TASK_SOURCE_TYPE,
  type AgentTaskItem,
  type AgentTaskState,
  type AgentTaskSource,
  type AgentTaskSourceType,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { Clock, User, Bot, RotateCw, FileText, Cog, Bell } from "lucide-react";
import { cn } from "../../utils/cn.js";
import { getTaskStateLabel } from "../../utils/task-utils.js";
import { useModalDialog } from "../../providers/modal-dialog-provider.js";
import { MarkdownViewerDialog } from "../common/dialogs/markdown-viewer-dialog.js";
import { TaskActions } from "./task-actions.js";
import { formatRelativeTime } from "../../utils/format-utils.js";

interface TaskCardProps {
  task: AgentTaskItem;
  agents: AgentConfig[];
}

/** Badge background per task state */
const STATE_BADGE_STYLE: Record<AgentTaskState, string> = {
  [AGENT_TASK_STATE.OPEN]: "bg-secondary/12 text-secondary",
  [AGENT_TASK_STATE.ACTIVE]: "bg-primary/12 text-primary",
  [AGENT_TASK_STATE.COMPLETED]: "bg-success/12 text-success",
  [AGENT_TASK_STATE.INCOMPLETE]: "bg-warning/12 text-warning",
  [AGENT_TASK_STATE.CLOSED]: "bg-surface-elevated text-text-muted",
};

/**
 * Task card — compact panel with left-edge state indicator,
 * task content, metadata badges, and relative timestamps.
 */
export function TaskCard({ task, agents }: TaskCardProps) {
  const { showDialog } = useModalDialog();
  const isClosed = task.state === AGENT_TASK_STATE.CLOSED;
  const isActive = task.state === AGENT_TASK_STATE.ACTIVE;

  const openContentViewer = () => {
    showDialog({
      id: `task-content-${task.id}`,
      component: MarkdownViewerDialog,
      componentProps: { content: task.task },
      title: "Task Content",
      className: "w-[95vw] md:w-3xl h-[60vh] flex flex-col",
    });
  };

  const openResultViewer = () => {
    if (!task.taskResult) {
      return;
    }

    showDialog({
      id: `task-result-${task.id}`,
      component: MarkdownViewerDialog,
      componentProps: { content: task.taskResult },
      title: "Task Result",
      className: "w-[95vw] md:w-3xl h-[60vh] flex flex-col",
    });
  };

  /** Resolve an agent ID to display name, falling back to truncated ID */
  const resolveAgentName = (agentId: string): string => {
    const agent = agents.find((agentItem) => agentItem.id === agentId);
    return agent?.name ?? agentId.slice(0, 8);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 px-4 py-3 h-full",
        "rounded-lg border border-border-subtle/60",
        "bg-surface hover:bg-surface-elevated/60",
        "transition-all duration-(--duration-normal)",
        "hover:border-border hover:shadow-card",
        isClosed && "opacity-75"
      )}
    >
      {/* Active glow effect */}
      {isActive && (
        <div className="absolute inset-0 rounded-lg pointer-events-none animate-pulse opacity-30 shadow-glow-accent" />
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
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-(--duration-fast)">
            <TaskActions task={task} />
          </div>

          <span className="text-3xs font-mono text-text-muted tabular-nums">
            {formatRelativeTime(task.updatedTimestamp)}
          </span>
        </div>
      </div>

      {/* Task content — click to view full content in modal */}
      <button
        type="button"
        className={cn(
          "flex-1 text-sm leading-relaxed line-clamp-4 text-left cursor-pointer",
          isClosed
            ? "text-text-muted line-through decoration-text-muted/30"
            : "text-text-base hover:underline decoration-text-muted/30 underline-offset-2"
        )}
        onClick={openContentViewer}
      >
        {task.task}
      </button>

      {/* Task result — shown when available */}
      {task.taskResult && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-inset/60 border border-border-subtle/40 text-left cursor-pointer hover:border-border-subtle transition-colors"
          onClick={openResultViewer}
        >
          <FileText className="w-3 h-3 text-success shrink-0" />
          <span className="text-2xs text-text-neutral line-clamp-2">{task.taskResult}</span>
        </button>
      )}

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

/** Resolve display name from a task source using discriminant narrowing */
function resolveSourceName(source: AgentTaskSource, resolveAgentName: (id: string) => string): string {
  if (source.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
    return resolveAgentName(source.agentId);
  }

  if (source.sourceType === AGENT_TASK_SOURCE_TYPE.LOOP) {
    return "Loop";
  }

  if (source.sourceType === AGENT_TASK_SOURCE_TYPE.REMINDER) {
    return "Reminder";
  }

  return "User";
}

/** Map source type to icon — declared outside render to avoid ESLint static-components rule */
const SOURCE_TYPE_ICON: Record<AgentTaskSourceType, typeof Bot> = {
  [AGENT_TASK_SOURCE_TYPE.AGENT]: Bot,
  [AGENT_TASK_SOURCE_TYPE.LOOP]: RotateCw,
  [AGENT_TASK_SOURCE_TYPE.REMINDER]: Bell,
  [AGENT_TASK_SOURCE_TYPE.USER]: User,
  [AGENT_TASK_SOURCE_TYPE.SYSTEM]: Cog,
};

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
  const Icon = SOURCE_TYPE_ICON[source.sourceType];
  const name = resolveSourceName(source, resolveAgentName);

  return (
    <span className="flex items-center gap-1.5 text-3xs text-text-muted">
      <span className="text-text-muted/60">{label}:</span>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-surface-elevated/80 text-text-neutral font-medium">
        <Icon className="w-3 h-3" />
        {name}
      </span>
    </span>
  );
}
