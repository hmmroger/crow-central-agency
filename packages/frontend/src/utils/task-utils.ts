import {
  AGENT_TASK_STATE,
  AGENT_TASK_SOURCE_TYPE,
  type AgentTaskItem,
  type AgentTaskState,
} from "@crow-central-agency/shared";

/** Whether the user can complete a task: it is in their court (OPEN and owned by the user) */
export function canCompleteTask(task: AgentTaskItem): boolean {
  return task.state === AGENT_TASK_STATE.OPEN && task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.USER;
}

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

/** Whether a task has reached a terminal state (COMPLETED, INCOMPLETE, or CLOSED) */
export function isTerminalTask(state: AgentTaskState): boolean {
  return (
    state === AGENT_TASK_STATE.COMPLETED || state === AGENT_TASK_STATE.INCOMPLETE || state === AGENT_TASK_STATE.CLOSED
  );
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
