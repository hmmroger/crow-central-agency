import { AGENT_TASK_STATE, type AgentTaskState } from "@crow-central-agency/shared";

/** Whether a task's content can be edited (only OPEN tasks) */
export function canEditTask(state: AgentTaskState): boolean {
  return state === AGENT_TASK_STATE.OPEN;
}

/** Whether a task can be assigned to an agent (only OPEN tasks) */
export function canAssignTask(state: AgentTaskState): boolean {
  return state === AGENT_TASK_STATE.OPEN;
}

/** Whether a task can be closed (OPEN, COMPLETED, or INCOMPLETE) */
export function canCloseTask(state: AgentTaskState): boolean {
  return (
    state === AGENT_TASK_STATE.OPEN || state === AGENT_TASK_STATE.COMPLETED || state === AGENT_TASK_STATE.INCOMPLETE
  );
}

/** Whether a task can be deleted (everything except ACTIVE) */
export function canDeleteTask(state: AgentTaskState): boolean {
  return state !== AGENT_TASK_STATE.ACTIVE;
}

/** Sort priority for task states — lower = shown first */
const TASK_STATE_ORDER: Record<AgentTaskState, number> = {
  [AGENT_TASK_STATE.ACTIVE]: 0,
  [AGENT_TASK_STATE.OPEN]: 1,
  [AGENT_TASK_STATE.INCOMPLETE]: 2,
  [AGENT_TASK_STATE.COMPLETED]: 3,
  [AGENT_TASK_STATE.CLOSED]: 4,
};

/** Get numeric sort order for a task state (lower = higher priority) */
export function getTaskStateOrder(state: AgentTaskState): number {
  return TASK_STATE_ORDER[state];
}

/** State display labels */
const TASK_STATE_LABEL: Record<AgentTaskState, string> = {
  [AGENT_TASK_STATE.OPEN]: "Open",
  [AGENT_TASK_STATE.ACTIVE]: "Active",
  [AGENT_TASK_STATE.COMPLETED]: "Completed",
  [AGENT_TASK_STATE.INCOMPLETE]: "Incomplete",
  [AGENT_TASK_STATE.CLOSED]: "Closed",
};

/** Get display label for a task state */
export function getTaskStateLabel(state: AgentTaskState): string {
  return TASK_STATE_LABEL[state];
}

/** Time thresholds in milliseconds */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a timestamp as a relative time string (e.g. "2 min ago", "3 hours ago").
 * Falls back to locale date for timestamps older than 7 days.
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;

  if (diff < MINUTE) {
    return "just now";
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);

    return `${minutes} min ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);

    return `${hours}h ago`;
  }

  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);

    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}
