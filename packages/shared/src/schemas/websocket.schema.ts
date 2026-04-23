import { z } from "zod";
import { PERMISSION_DECISION } from "./permission.schema.js";
import { AgentConfigSchema } from "./agent.schema.js";
import { AgentMessageSchema } from "./agent-message.schema.js";
import { AgentTaskItemSchema, AgentTaskStateSchema } from "./agent-task.schema.js";
import { AgentCircleSchema, RelationshipSchema } from "./agent-circle.schema.js";
import { AGENT_STATUS, AgentActivitySchema } from "./agent-runtime-state.schema.js";
import { MessageSourceSchema } from "./message-source.schema.js";

/**
 * WebSocket message types - Client -> Server
 */
export const CLIENT_MESSAGE_TYPE = {
  SEND_MESSAGE: "send_message",
  INJECT_MESSAGE: "inject_message",
  PERMISSION_RESPONSE: "permission_response",
} as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPE)[keyof typeof CLIENT_MESSAGE_TYPE];

/**
 * WebSocket message types - Server -> Client
 */
export const SERVER_MESSAGE_TYPE = {
  AGENT_TEXT: "agent_text",
  AGENT_ACTIVITY: "agent_activity",
  AGENT_RESULT: "agent_result",
  AGENT_STATUS: "agent_status",
  AGENT_UPDATED: "agent_updated",
  AGENT_USAGE: "agent_usage",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_CANCELLED: "permission_cancelled",
  ERROR: "error",
  AGENT_MESSAGE: "agent_message",
  AGENT_TOOL_PROGRESS: "agent_tool_progress",
  TASK_ADDED: "task_added",
  TASK_UPDATED: "task_updated",
  TASK_ASSIGNED: "task_assigned",
  TASK_STATE_CHANGED: "task_state_changed",
  TASK_DELETED: "task_deleted",
  CIRCLE_CREATED: "circle_created",
  CIRCLE_UPDATED: "circle_updated",
  CIRCLE_DELETED: "circle_deleted",
  RELATIONSHIP_CREATED: "relationship_created",
  RELATIONSHIP_DELETED: "relationship_deleted",
} as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPE)[keyof typeof SERVER_MESSAGE_TYPE];

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

export const AgentTextWsMessageSchema = z.object({
  type: z.literal("agent_text"),
  agentId: z.string(),
  text: z.string(),
});

export const AgentActivityWsMessageSchema = z.object({
  type: z.literal("agent_activity"),
  agentId: z.string(),
  agentActivity: AgentActivitySchema,
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
  status: z.enum([AGENT_STATUS.IDLE, AGENT_STATUS.ACTIVATING, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING]),
  messageSource: MessageSourceSchema.optional(),
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

export const TaskAddedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.TASK_ADDED),
  task: AgentTaskItemSchema,
});

export const TaskUpdatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.TASK_UPDATED),
  task: AgentTaskItemSchema,
});

export const TaskAssignedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.TASK_ASSIGNED),
  task: AgentTaskItemSchema,
});

export const TaskStateChangedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.TASK_STATE_CHANGED),
  task: AgentTaskItemSchema,
  previousState: AgentTaskStateSchema,
});

export const TaskDeletedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.TASK_DELETED),
  taskId: z.string(),
});

export const CircleCreatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.CIRCLE_CREATED),
  circle: AgentCircleSchema,
});

export const CircleUpdatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.CIRCLE_UPDATED),
  circle: AgentCircleSchema,
});

export const CircleDeletedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.CIRCLE_DELETED),
  circleId: z.string(),
});

export const RelationshipCreatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.RELATIONSHIP_CREATED),
  relationship: RelationshipSchema,
});

export const RelationshipDeletedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.RELATIONSHIP_DELETED),
  relationshipId: z.string(),
});

/** Server -> Client discriminated union for runtime parsing */
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
  TaskAddedWsMessageSchema,
  TaskUpdatedWsMessageSchema,
  TaskAssignedWsMessageSchema,
  TaskStateChangedWsMessageSchema,
  TaskDeletedWsMessageSchema,
  CircleCreatedWsMessageSchema,
  CircleUpdatedWsMessageSchema,
  CircleDeletedWsMessageSchema,
  RelationshipCreatedWsMessageSchema,
  RelationshipDeletedWsMessageSchema,
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
export type TaskAddedWsMessage = z.infer<typeof TaskAddedWsMessageSchema>;
export type TaskUpdatedWsMessage = z.infer<typeof TaskUpdatedWsMessageSchema>;
export type TaskAssignedWsMessage = z.infer<typeof TaskAssignedWsMessageSchema>;
export type TaskStateChangedWsMessage = z.infer<typeof TaskStateChangedWsMessageSchema>;
export type TaskDeletedWsMessage = z.infer<typeof TaskDeletedWsMessageSchema>;
export type CircleCreatedWsMessage = z.infer<typeof CircleCreatedWsMessageSchema>;
export type CircleUpdatedWsMessage = z.infer<typeof CircleUpdatedWsMessageSchema>;
export type CircleDeletedWsMessage = z.infer<typeof CircleDeletedWsMessageSchema>;
export type RelationshipCreatedWsMessage = z.infer<typeof RelationshipCreatedWsMessageSchema>;
export type RelationshipDeletedWsMessage = z.infer<typeof RelationshipDeletedWsMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
