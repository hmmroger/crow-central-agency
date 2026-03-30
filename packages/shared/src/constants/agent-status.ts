/**
 * Agent runtime status values
 */
export const AGENT_STATUS = {
  IDLE: "idle",
  STREAMING: "streaming",
  COMPACTING: "compacting",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];
