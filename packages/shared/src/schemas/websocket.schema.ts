import { z } from "zod";
import { PERMISSION_DECISION } from "./permission.schema.js";
import { AgentConfigSchema } from "./agent.schema.js";
import { AgentMessageSchema } from "./agent-message.schema.js";
import { AgentTaskItemSchema, AgentTaskStateSchema } from "./agent-task.schema.js";
import { AgentCircleSchema, RelationshipSchema } from "./agent-circle.schema.js";
import { AGENT_STATUS, AgentActivitySchema, BranchPointSchema } from "./agent-runtime-state.schema.js";
import { MessageSourceSchema } from "./message-source.schema.js";
import { AgentCommandSchema } from "./agent-command.schema.js";
import { AgentBuilderDraftViewSchema } from "./agent-builder.schema.js";
import {
  AskUserQuestionItemSchema,
  QUESTION_SUBMISSION_KIND,
  QuestionAnswerSchema,
} from "./ask-user-question.schema.js";

/**
 * WebSocket message types - Client -> Server
 */
export const CLIENT_MESSAGE_TYPE = {
  SEND_MESSAGE: "send_message",
  INJECT_MESSAGE: "inject_message",
  PERMISSION_RESPONSE: "permission_response",
  RESOLVE_QUESTION: "resolve_question",
  COMMAND: "command",
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
  AGENT_CREATED: "agent_created",
  AGENT_UPDATED: "agent_updated",
  AGENT_DELETED: "agent_deleted",
  AGENT_USAGE: "agent_usage",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_CANCELLED: "permission_cancelled",
  QUESTION_REQUEST: "question_request",
  QUESTION_RESOLVED: "question_resolved",
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
  FRAGMENT_CREATED: "fragment_created",
  FRAGMENT_UPDATED: "fragment_updated",
  FRAGMENT_DELETED: "fragment_deleted",
  AGENT_BUILDER_DRAFT_UPDATED: "agent_builder_draft_updated",
} as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPE)[keyof typeof SERVER_MESSAGE_TYPE];

export const SendMessageSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.SEND_MESSAGE),
  agentId: z.string(),
  message: z.string(),
  /** When present, fork the named session at the anchor and continue from there instead of the active session */
  branchPoint: BranchPointSchema.optional(),
});

export const InjectMessageSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.INJECT_MESSAGE),
  agentId: z.string(),
  message: z.string(),
});

export const PermissionResponseWsSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE),
  agentId: z.string(),
  toolUseId: z.string(),
  decision: z.enum([PERMISSION_DECISION.ALLOW, PERMISSION_DECISION.DENY, PERMISSION_DECISION.ALLOW_ALWAYS]),
  message: z.string().optional(),
  /** Client-edited rules an allow_always should persist. Absent means use what the backend derived. */
  rules: z.array(z.string()).optional(),
});

/**
 * Resolve a parked AskUserQuestion. `answers`/`response` are loosely optional here; the strict xor is
 * enforced by re-parsing into the question submission union at the routing boundary.
 */
export const ResolveQuestionWsSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.RESOLVE_QUESTION),
  toolUseId: z.string(),
  kind: z.enum([QUESTION_SUBMISSION_KIND.ANSWERS, QUESTION_SUBMISSION_KIND.RESPONSE]),
  answers: z.array(QuestionAnswerSchema).optional(),
  response: z.string().optional(),
});

export const CommandMessageSchema = z.object({
  type: z.literal(CLIENT_MESSAGE_TYPE.COMMAND),
  agentId: z.string(),
  command: AgentCommandSchema,
  message: z.string().optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  SendMessageSchema,
  InjectMessageSchema,
  PermissionResponseWsSchema,
  ResolveQuestionWsSchema,
  CommandMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type SendMessage = z.infer<typeof SendMessageSchema>;
export type InjectMessage = z.infer<typeof InjectMessageSchema>;
export type PermissionResponseWs = z.infer<typeof PermissionResponseWsSchema>;
export type ResolveQuestionWs = z.infer<typeof ResolveQuestionWsSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;

export const AgentTextWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_TEXT),
  agentId: z.string(),
  text: z.string(),
});

export const AgentActivityWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_ACTIVITY),
  agentId: z.string(),
  agentActivity: AgentActivitySchema,
});

export const AgentResultWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_RESULT),
  agentId: z.string(),
  subtype: z.string(),
  totalCostUsd: z.number().optional(),
  durationMs: z.number().optional(),
});

export const AgentStatusWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_STATUS),
  agentId: z.string(),
  status: z.enum([AGENT_STATUS.IDLE, AGENT_STATUS.ACTIVATING, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING]),
  messageSource: MessageSourceSchema.optional(),
});

export const AgentCreatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_CREATED),
  agentId: z.string(),
  config: AgentConfigSchema,
});

export const AgentUpdatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_UPDATED),
  agentId: z.string(),
  config: AgentConfigSchema,
});

export const AgentDeletedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_DELETED),
  agentId: z.string(),
});

export const AgentUsageWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_USAGE),
  agentId: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalCostUsd: z.number(),
  contextUsed: z.number(),
  contextTotal: z.number(),
});

export const PermissionRequestWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.PERMISSION_REQUEST),
  agentId: z.string(),
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  autoApproveRules: z.array(z.string()).optional(),
  decisionReason: z.string().optional(),
});

export const PermissionCancelledWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.PERMISSION_CANCELLED),
  agentId: z.string(),
  toolUseId: z.string(),
});

export const QuestionRequestWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.QUESTION_REQUEST),
  agentId: z.string(),
  toolUseId: z.string(),
  questions: z.array(AskUserQuestionItemSchema),
});

export const QuestionResolvedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.QUESTION_RESOLVED),
  agentId: z.string(),
  toolUseId: z.string(),
});

export const ErrorWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.ERROR),
  agentId: z.string().optional(),
  code: z.string(),
  message: z.string(),
});

export const AgentMessageWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_MESSAGE),
  agentId: z.string(),
  message: AgentMessageSchema,
});

export const AgentToolProgressWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_TOOL_PROGRESS),
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

export const FragmentCreatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.FRAGMENT_CREATED),
  fragmentId: z.string(),
});

export const FragmentUpdatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.FRAGMENT_UPDATED),
  fragmentId: z.string(),
});

export const FragmentDeletedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.FRAGMENT_DELETED),
  fragmentId: z.string(),
});

/** The single agent-builder draft changed; carries the resolved view, or null when it was cleared. */
export const AgentBuilderDraftUpdatedWsMessageSchema = z.object({
  type: z.literal(SERVER_MESSAGE_TYPE.AGENT_BUILDER_DRAFT_UPDATED),
  draft: AgentBuilderDraftViewSchema.nullable(),
});

/** Server -> Client discriminated union for runtime parsing */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentCreatedWsMessageSchema,
  AgentUpdatedWsMessageSchema,
  AgentDeletedWsMessageSchema,
  AgentUsageWsMessageSchema,
  PermissionRequestWsMessageSchema,
  PermissionCancelledWsMessageSchema,
  QuestionRequestWsMessageSchema,
  QuestionResolvedWsMessageSchema,
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
  FragmentCreatedWsMessageSchema,
  FragmentUpdatedWsMessageSchema,
  FragmentDeletedWsMessageSchema,
  AgentBuilderDraftUpdatedWsMessageSchema,
]);

export type AgentTextWsMessage = z.infer<typeof AgentTextWsMessageSchema>;
export type AgentActivityWsMessage = z.infer<typeof AgentActivityWsMessageSchema>;
export type AgentResultWsMessage = z.infer<typeof AgentResultWsMessageSchema>;
export type AgentStatusWsMessage = z.infer<typeof AgentStatusWsMessageSchema>;
export type AgentCreatedWsMessage = z.infer<typeof AgentCreatedWsMessageSchema>;
export type AgentUpdatedWsMessage = z.infer<typeof AgentUpdatedWsMessageSchema>;
export type AgentDeletedWsMessage = z.infer<typeof AgentDeletedWsMessageSchema>;
export type AgentUsageWsMessage = z.infer<typeof AgentUsageWsMessageSchema>;
export type PermissionRequestWsMessage = z.infer<typeof PermissionRequestWsMessageSchema>;
export type PermissionCancelledWsMessage = z.infer<typeof PermissionCancelledWsMessageSchema>;
export type QuestionRequestWsMessage = z.infer<typeof QuestionRequestWsMessageSchema>;
export type QuestionResolvedWsMessage = z.infer<typeof QuestionResolvedWsMessageSchema>;
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
export type FragmentCreatedWsMessage = z.infer<typeof FragmentCreatedWsMessageSchema>;
export type FragmentUpdatedWsMessage = z.infer<typeof FragmentUpdatedWsMessageSchema>;
export type FragmentDeletedWsMessage = z.infer<typeof FragmentDeletedWsMessageSchema>;
export type AgentBuilderDraftUpdatedWsMessage = z.infer<typeof AgentBuilderDraftUpdatedWsMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** The server messages scoped to a single agent — those carrying an `agentId`. */
export type AgentServerMessage = Extract<ServerMessage, { agentId: string }>;

export function isAgentServerMessage(message: ServerMessage): message is AgentServerMessage {
  return "agentId" in message && typeof message.agentId === "string";
}

export type AgentLifecycleServerMessage = Extract<
  AgentServerMessage,
  {
    type:
      | typeof SERVER_MESSAGE_TYPE.AGENT_CREATED
      | typeof SERVER_MESSAGE_TYPE.AGENT_UPDATED
      | typeof SERVER_MESSAGE_TYPE.AGENT_DELETED;
  }
>;

const AGENT_LIFECYCLE_MESSAGE_TYPES: ReadonlySet<ServerMessageType> = new Set([
  SERVER_MESSAGE_TYPE.AGENT_CREATED,
  SERVER_MESSAGE_TYPE.AGENT_UPDATED,
  SERVER_MESSAGE_TYPE.AGENT_DELETED,
]);

export function isAgentLifecycleServerMessage(message: ServerMessage): message is AgentLifecycleServerMessage {
  return AGENT_LIFECYCLE_MESSAGE_TYPES.has(message.type);
}
