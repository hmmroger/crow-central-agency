import { z } from "zod";

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
} as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPE)[keyof typeof AGENT_MESSAGE_TYPE];

/** Shared base fields for all agent messages */
const AgentMessageBase = z.object({
  /** Unique message identifier (derived from SDK SessionMessage uuid) */
  id: z.string(),
  /** Message content - user text, agent markdown response, or tool activity description */
  content: z.string(),
  /** Timestamp for ordering */
  timestamp: z.number(),
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

/**
 * Agent message - the standard message data model for the conversation.
 * Created exclusively by SessionManager from SDK SessionMessage data.
 * Discriminated union on `type` enforces valid role/type combinations.
 */
export const AgentMessageSchema = z.discriminatedUnion("type", [
  TextMessageSchema,
  ThinkingMessageSchema,
  ToolUseMessageSchema,
]);

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
