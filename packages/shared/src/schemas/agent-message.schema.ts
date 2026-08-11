import { z } from "zod";
import { BranchPointSchema } from "./agent-runtime-state.schema.js";

export const AGENT_MESSAGE_ROLE = {
  USER: "user",
  AGENT: "agent",
  SYSTEM: "system",
} as const;

export type AgentMessageRole = (typeof AGENT_MESSAGE_ROLE)[keyof typeof AGENT_MESSAGE_ROLE];

export const AGENT_MESSAGE_TYPE = {
  TEXT: "TEXT",
  THINKING: "THINKING",
  TOOL_USE: "TOOL_USE",
  COMMAND: "COMMAND",
} as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPE)[keyof typeof AGENT_MESSAGE_TYPE];

export const MessageAnnotationSchema = z.object({
  id: z.string(),
  hasAudioMessage: z.boolean().optional(),
  voiceName: z.string().optional(),
  audioMimeType: z.string().optional(),
  audioSampleRate: z.number().optional(),
  durationMs: z.number().optional(),
});

export type MessageAnnotation = z.infer<typeof MessageAnnotationSchema>;

/** Shared base fields for all agent messages */
const AgentMessageBase = z.object({
  /** Unique message identifier (derived from SDK SessionMessage uuid) */
  id: z.string(),
  /** Message content - user text, agent markdown response, or tool activity description */
  content: z.string(),
  /** Timestamp for ordering */
  timestamp: z.number(),
  annotations: MessageAnnotationSchema.omit({ id: true }).optional(),
  /**
   * Session and transcript entry to fork at. Set only on messages a branch may anchor on, so
   * presence is both the eligibility signal and the anchor value. The client echoes it back
   * verbatim as the send request's `branchPoint` and never has to know a session id.
   */
  branchAnchor: BranchPointSchema.optional(),
});

/** User or agent text message */
const TextMessageSchema = AgentMessageBase.extend({
  role: z.enum([AGENT_MESSAGE_ROLE.USER, AGENT_MESSAGE_ROLE.AGENT]),
  type: z.literal(AGENT_MESSAGE_TYPE.TEXT),
});

/** Agent thinking block (collapsed in UI by default) */
const ThinkingMessageSchema = AgentMessageBase.extend({
  role: z.literal(AGENT_MESSAGE_ROLE.AGENT),
  type: z.literal(AGENT_MESSAGE_TYPE.THINKING),
});

/** Tool use activity (system-generated) */
const ToolUseMessageSchema = AgentMessageBase.extend({
  role: z.literal(AGENT_MESSAGE_ROLE.SYSTEM),
  type: z.literal(AGENT_MESSAGE_TYPE.TOOL_USE),
  /** Tool name - identifies which tool was used */
  toolName: z.string(),
  /** Raw tool input passed to the tool */
  toolInput: z.record(z.string(), z.unknown()),
});

/** Slash-command invocation or its output (system-generated) */
const CommandMessageSchema = AgentMessageBase.extend({
  role: z.literal(AGENT_MESSAGE_ROLE.SYSTEM),
  type: z.literal(AGENT_MESSAGE_TYPE.COMMAND),
});

/**
 * Agent message - the standard message data model for the conversation.
 * Created exclusively by SessionManager from SDK SessionMessage data.
 * Discriminated union on `type` enforces valid role/type combinations.
 */
export const AgentMessageSchema = z.discriminatedUnion("type", [
  TextMessageSchema,
  ThinkingMessageSchema,
  ToolUseMessageSchema,
  CommandMessageSchema,
]);

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
