import { z } from "zod";
import { AGENT_STATUS } from "../constants/agent-status.js";

/**
 * Session usage tracking - accumulated across queries in a session
 */
export const SessionUsageSchema = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  totalCostUsd: z.number().default(0),
  contextUsed: z.number().default(0),
  contextTotal: z.number().default(0),
});

/**
 * Pending permission request metadata - persisted on runtime state
 * so the frontend can recover pending permissions on refresh.
 */
export const PendingPermissionInfoSchema = z.object({
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  decisionReason: z.string().optional(),
});

/**
 * Agent runtime state - maintained by the orchestrator per agent.
 */
export const AgentRuntimeStateSchema = z.object({
  agentId: z.string(),
  status: z.enum([AGENT_STATUS.IDLE, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING]).default(AGENT_STATUS.IDLE),
  sessionId: z.string().optional(),
  sessionUsage: SessionUsageSchema,
  lastError: z.string().optional(),
  pendingPermissions: z.array(PendingPermissionInfoSchema).optional(),
});

/**
 * Persisted to orchestrator-state.json for restart recovery.
 */
export const CrowStateSchema = z.object({
  version: z.number(),
  agentStates: z.array(AgentRuntimeStateSchema).optional(),
});

export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export type PendingPermissionInfo = z.infer<typeof PendingPermissionInfoSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
export type CrowState = z.infer<typeof CrowStateSchema>;
