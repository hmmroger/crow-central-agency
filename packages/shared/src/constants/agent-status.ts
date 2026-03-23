/**
 * Agent runtime status values
 */
export const AGENT_STATUS = {
  IDLE: "idle",
  STREAMING: "streaming",
  WAITING_PERMISSION: "waiting_permission",
  WAITING_AGENT: "waiting_agent",
  COMPACTING: "compacting",
  ERROR: "error",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];
