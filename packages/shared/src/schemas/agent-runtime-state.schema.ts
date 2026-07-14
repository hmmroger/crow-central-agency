import { z } from "zod";
import { MessageSourceSchema } from "./message-source.schema.js";

/** Maximum number of recent user inputs retained per agent for compose-box recall. */
export const MAX_INPUT_HISTORY = 30;

export const AGENT_STATUS = {
  IDLE: "idle",
  ACTIVATING: "activating",
  STREAMING: "streaming",
  COMPACTING: "compacting",
} as const;

export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];

export const AGENT_ACTIVITY_TYPE = {
  GENERAL: "GENERAL",
  QUERYSTART: "QUERYSTART",
  TOOLUSE: "TOOLUSE",
} as const;
export type AgentActivityType = (typeof AGENT_ACTIVITY_TYPE)[keyof typeof AGENT_ACTIVITY_TYPE];

export const AgentActivityCommonSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
});

export const AgentQueryStartSchema = AgentActivityCommonSchema.extend({
  type: z.literal(AGENT_ACTIVITY_TYPE.QUERYSTART),
});
export type AgentQueryStartActivity = z.infer<typeof AgentQueryStartSchema>;

export const AgentGeneralActivitySchema = AgentActivityCommonSchema.extend({
  type: z.literal(AGENT_ACTIVITY_TYPE.GENERAL),
  activity: z.string(),
  description: z.string(),
  subAgentId: z.string().optional(),
});
export type AgentGeneralActivity = z.infer<typeof AgentGeneralActivitySchema>;

export const AgentToolUseActivitySchema = AgentActivityCommonSchema.extend({
  type: z.literal(AGENT_ACTIVITY_TYPE.TOOLUSE),
  toolName: z.string(),
  description: z.string(),
  input: z.unknown().optional(),
  subAgentId: z.string().optional(),
});
export type AgentToolUseActivity = z.infer<typeof AgentToolUseActivitySchema>;

export const AgentActivitySchema = z.discriminatedUnion("type", [
  AgentGeneralActivitySchema,
  AgentToolUseActivitySchema,
  AgentQueryStartSchema,
]);

export type AgentActivity = AgentGeneralActivity | AgentToolUseActivity | AgentQueryStartActivity;

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
 * One-shot flags marking which instruction sources changed since the agent's last turn.
 * Set when persona/AGENT.md is edited and cleared after the next turn injects a reminder.
 */
export const PendingInstructionReminderSchema = z.object({
  persona: z.boolean().optional(),
  agentMd: z.boolean().optional(),
});

/**
 * Agent runtime state - maintained by the runtime manager per agent.
 */
export const AgentRuntimeStateSchema = z.object({
  agentId: z.string(),
  status: z
    .enum([AGENT_STATUS.IDLE, AGENT_STATUS.ACTIVATING, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING])
    .default(AGENT_STATUS.IDLE),
  messageSource: MessageSourceSchema.optional(),
  discordDmChannelId: z.string().optional(),
  sessionId: z.string().optional(),
  /** Nearest DOMAIN fragments of the agent's last touched fragment (the graph is a DAG, so there may be several); a signal for context injection, never an implicit parent. */
  activeDomainFragmentIds: z.array(z.string()).default([]),
  sessionUsage: SessionUsageSchema,
  prevLoopMessageTimestamp: z.number().optional(),
  lastGmailCheckTimestamp: z.number().optional(),
  lastError: z.string().optional(),
  pendingPermissions: z.array(PendingPermissionInfoSchema).optional(),
  pendingInstructionReminder: PendingInstructionReminderSchema.optional(),
  /** Recent user message inputs (oldest first) for compose-box Up/Down recall; survives new sessions. */
  inputHistory: z.array(z.string()).optional(),
});

export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export type PendingPermissionInfo = z.infer<typeof PendingPermissionInfoSchema>;
export type PendingInstructionReminder = z.infer<typeof PendingInstructionReminderSchema>;
export type AgentRuntimeState = z.infer<typeof AgentRuntimeStateSchema>;
