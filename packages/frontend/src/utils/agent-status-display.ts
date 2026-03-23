import { AGENT_STATUS, type AgentStatus } from "@crow-central-agency/shared";

/** Status dot background color */
export const STATUS_DOT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "bg-text-muted",
  [AGENT_STATUS.STREAMING]: "bg-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "bg-warning",
  [AGENT_STATUS.WAITING_AGENT]: "bg-info",
  [AGENT_STATUS.COMPACTING]: "bg-secondary",
  [AGENT_STATUS.ERROR]: "bg-error",
};

/** Status text color */
export const STATUS_TEXT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "text-text-muted",
  [AGENT_STATUS.STREAMING]: "text-primary",
  [AGENT_STATUS.WAITING_PERMISSION]: "text-warning",
  [AGENT_STATUS.WAITING_AGENT]: "text-info",
  [AGENT_STATUS.COMPACTING]: "text-secondary",
  [AGENT_STATUS.ERROR]: "text-error",
};

/** Human-readable status labels */
export const STATUS_LABEL: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "Idle",
  [AGENT_STATUS.STREAMING]: "Streaming",
  [AGENT_STATUS.WAITING_PERMISSION]: "Waiting Permission",
  [AGENT_STATUS.WAITING_AGENT]: "Waiting Agent",
  [AGENT_STATUS.COMPACTING]: "Compacting",
  [AGENT_STATUS.ERROR]: "Error",
};
