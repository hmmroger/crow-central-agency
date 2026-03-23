import { z } from "zod";
import { AGENT_MESSAGE_ROLE } from "../constants/agent-message-role.js";

/**
 * Agent message — the standard message data model for the conversation.
 * Created exclusively by SessionManager from SDK SessionMessage data.
 */
export const AgentMessageSchema = z.object({
  /** Unique message identifier (derived from SDK SessionMessage uuid) */
  id: z.string(),
  /** Message role: user (human input), agent (AI text response), system (tool use activity) */
  role: z.enum([AGENT_MESSAGE_ROLE.USER, AGENT_MESSAGE_ROLE.AGENT, AGENT_MESSAGE_ROLE.SYSTEM]),
  /** Message content — user text, agent markdown response, or tool activity description */
  content: z.string(),
  /** Tool name (only for system role messages — identifies which tool was used) */
  toolName: z.string().optional(),
  /** Timestamp for ordering */
  timestamp: z.number(),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
