import { z } from "zod";
import { AGENT_STATUS } from "../constants/agent-status.js";
import { PERMISSION_DECISION } from "./permission.schema.js";
import { AgentConfigSchema } from "./agent.schema.js";
import { AgentMessageSchema } from "./agent-message.schema.js";
import { CLIENT_MESSAGE_TYPE } from "../constants/message-type.js";

// --- Client → Server messages ---

export const SendMessageSchema = z.object({
  type: z.literal("send_message"),
  agentId: z.string(),
  message: z.string(),
});

export const InjectMessageSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.INJECT_MESSAGE),
  agentId: z.string(),
  message: z.string(),
});

export const PermissionResponseWsSchema = z.object({
  type: z.literal("permission_response"),
  agentId: z.string(),
  toolUseId: z.string(),
  decision: z.enum([PERMISSION_DECISION.ALLOW, PERMISSION_DECISION.DENY]),
  message: z.string().optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  SendMessageSchema,
  InjectMessageSchema,
  PermissionResponseWsSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type InjectMessage = z.infer<typeof InjectMessageSchema>;
export type PermissionResponseWs = z.infer<typeof PermissionResponseWsSchema>;

// --- Server → Client messages ---

export const AgentTextWsMessageSchema = z.object({
  type: z.literal("agent_text"),
  agentId: z.string(),
  text: z.string(),
});

export const AgentActivityWsMessageSchema = z.object({
  type: z.literal("agent_activity"),
  agentId: z.string(),
  toolName: z.string(),
  description: z.string(),
});

export const AgentResultWsMessageSchema = z.object({
  type: z.literal("agent_result"),
  agentId: z.string(),
  subtype: z.string(),
  totalCostUsd: z.number().optional(),
  durationMs: z.number().optional(),
});

export const AgentStatusWsMessageSchema = z.object({
  type: z.literal("agent_status"),
  agentId: z.string(),
  status: z.enum([
    AGENT_STATUS.IDLE,
    AGENT_STATUS.STREAMING,
    AGENT_STATUS.WAITING_PERMISSION,
    AGENT_STATUS.WAITING_AGENT,
    AGENT_STATUS.COMPACTING,
    AGENT_STATUS.ERROR,
  ]),
});

export const AgentUpdatedWsMessageSchema = z.object({
  type: z.literal("agent_updated"),
  agentId: z.string(),
  config: AgentConfigSchema,
});

export const AgentUsageWsMessageSchema = z.object({
  type: z.literal("agent_usage"),
  agentId: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
  contextUsed: z.number(),
  contextTotal: z.number(),
});

export const PermissionRequestWsMessageSchema = z.object({
  type: z.literal("permission_request"),
  agentId: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  decisionReason: z.string().optional(),
});

export const PermissionCancelledWsMessageSchema = z.object({
  type: z.literal("permission_cancelled"),
  agentId: z.string(),
  toolUseId: z.string(),
});

export const ErrorWsMessageSchema = z.object({
  type: z.literal("error"),
  agentId: z.string().optional(),
  code: z.string(),
  message: z.string(),
});

export const AgentMessageWsMessageSchema = z.object({
  type: z.literal("agent_message"),
  agentId: z.string(),
  message: AgentMessageSchema,
});

export const AgentToolProgressWsMessageSchema = z.object({
  type: z.literal("agent_tool_progress"),
  agentId: z.string(),
  toolName: z.string(),
  elapsedTimeSeconds: z.number(),
});

/** Server → Client discriminated union for runtime parsing */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentUpdatedWsMessageSchema,
  AgentUsageWsMessageSchema,
  PermissionRequestWsMessageSchema,
  PermissionCancelledWsMessageSchema,
  ErrorWsMessageSchema,
  AgentMessageWsMessageSchema,
  AgentToolProgressWsMessageSchema,
]);

export type AgentTextWsMessage = z.infer<typeof AgentTextWsMessageSchema>;
export type AgentActivityWsMessage = z.infer<typeof AgentActivityWsMessageSchema>;
export type AgentResultWsMessage = z.infer<typeof AgentResultWsMessageSchema>;
export type AgentStatusWsMessage = z.infer<typeof AgentStatusWsMessageSchema>;
export type AgentUpdatedWsMessage = z.infer<typeof AgentUpdatedWsMessageSchema>;
export type AgentUsageWsMessage = z.infer<typeof AgentUsageWsMessageSchema>;
export type PermissionRequestWsMessage = z.infer<typeof PermissionRequestWsMessageSchema>;
export type PermissionCancelledWsMessage = z.infer<typeof PermissionCancelledWsMessageSchema>;
export type ErrorWsMessage = z.infer<typeof ErrorWsMessageSchema>;
export type AgentMessageWsMessage = z.infer<typeof AgentMessageWsMessageSchema>;
export type AgentToolProgressWsMessage = z.infer<typeof AgentToolProgressWsMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
