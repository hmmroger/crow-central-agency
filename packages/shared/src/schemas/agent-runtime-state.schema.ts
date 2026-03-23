import { z } from "zod";
import { AGENT_STATUS } from "../constants/agent-status.js";

/**
 * Session usage tracking — accumulated across queries in a session
 */
export const SessionUsageSchema = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  totalCostUsd: z.number().default(0),
  contextUsed: z.number().default(0),
  contextTotal: z.number().default(0),
});

/**
 * Agent runtime state — maintained by the orchestrator per agent.
 * Persisted to orchestrator-state.json for restart recovery.
 */
export const AgentRuntimeStateSchema = z.object({
  agentId: z.string(),
  status: z
    .enum([
      AGENT_STATUS.IDLE,
      AGENT_STATUS.STREAMING,
      AGENT_STATUS.WAITING_PERMISSION,
      AGENT_STATUS.WAITING_AGENT,
      AGENT_STATUS.COMPACTING,
      AGENT_STATUS.ERROR,
    ])
    .default(AGENT_STATUS.IDLE),
  sessionId: z.string().optional(),
  sessionUsage: SessionUsageSchema.default({
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    contextUsed: 0,
    contextTotal: 0,
  }),
  waitingForAgentId: z.string().optional(),
  lastError: z.string().optional(),
});

export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
