import { AGENT_STATUS, type AgentStatus } from "@crow-central-agency/shared";

/** Status dot background color */
export const STATUS_DOT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "bg-text-muted",
  [AGENT_STATUS.STREAMING]: "bg-primary",
  [AGENT_STATUS.COMPACTING]: "bg-secondary",
};

/** Status text color */
export const STATUS_TEXT_COLOR: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "text-text-muted",
  [AGENT_STATUS.STREAMING]: "text-primary",
  [AGENT_STATUS.COMPACTING]: "text-secondary",
};

/** Human-readable status labels */
export const STATUS_LABEL: Record<AgentStatus, string> = {
  [AGENT_STATUS.IDLE]: "Idle",
  [AGENT_STATUS.STREAMING]: "Streaming",
  [AGENT_STATUS.COMPACTING]: "Compacting",
};
