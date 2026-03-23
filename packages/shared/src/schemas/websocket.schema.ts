import { z } from "zod";

// --- Client → Server messages ---

export const SubscribeMessageSchema = z.object({
  type: z.literal("subscribe"),
  agentId: z.string(),
});

export const UnsubscribeMessageSchema = z.object({
  type: z.literal("unsubscribe"),
  agentId: z.string(),
});

export const SendMessageSchema = z.object({
  type: z.literal("send_message"),
  agentId: z.string(),
  message: z.string(),
});

export const BtwMessageSchema = z.object({
  type: z.literal("btw_message"),
  agentId: z.string(),
  message: z.string(),
});

export const PermissionResponseSchema = z.object({
  type: z.literal("permission_response"),
  agentId: z.string(),
  toolUseId: z.string(),
  behavior: z.enum(["allow", "deny"]),
  message: z.string().optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  SendMessageSchema,
  BtwMessageSchema,
  PermissionResponseSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type SubscribeMessage = z.infer<typeof SubscribeMessageSchema>;
export type UnsubscribeMessage = z.infer<typeof UnsubscribeMessageSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type BtwMessage = z.infer<typeof BtwMessageSchema>;
export type PermissionResponse = z.infer<typeof PermissionResponseSchema>;

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
  isSubagent: z.boolean().default(false),
});

export const AgentResultWsMessageSchema = z.object({
  type: z.literal("agent_result"),
  agentId: z.string(),
  subtype: z.string(),
  costUsd: z.number().optional(),
  totalCostUsd: z.number().optional(),
  durationMs: z.number().optional(),
});

export const AgentStatusWsMessageSchema = z.object({
  type: z.literal("agent_status"),
  agentId: z.string(),
  status: z.string(),
});

export const AgentUpdatedWsMessageSchema = z.object({
  type: z.literal("agent_updated"),
  agentId: z.string(),
  config: z.record(z.string(), z.unknown()),
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

export type AgentTextWsMessage = z.infer<typeof AgentTextWsMessageSchema>;
export type AgentActivityWsMessage = z.infer<typeof AgentActivityWsMessageSchema>;
export type AgentResultWsMessage = z.infer<typeof AgentResultWsMessageSchema>;
export type AgentStatusWsMessage = z.infer<typeof AgentStatusWsMessageSchema>;
export type AgentUpdatedWsMessage = z.infer<typeof AgentUpdatedWsMessageSchema>;
export type AgentUsageWsMessage = z.infer<typeof AgentUsageWsMessageSchema>;
export type PermissionRequestWsMessage = z.infer<typeof PermissionRequestWsMessageSchema>;
export type PermissionCancelledWsMessage = z.infer<typeof PermissionCancelledWsMessageSchema>;
export type ErrorWsMessage = z.infer<typeof ErrorWsMessageSchema>;

export type ServerMessage =
  | AgentTextWsMessage
  | AgentActivityWsMessage
  | AgentResultWsMessage
  | AgentStatusWsMessage
  | AgentUpdatedWsMessage
  | AgentUsageWsMessage
  | PermissionRequestWsMessage
  | PermissionCancelledWsMessage
  | ErrorWsMessage;
