/**
 * Agent message role values - defines the source/purpose of each message.
 * - "user": message from the human user
 * - "agent": text response from the AI agent
 * - "system": tool use activity (file read, bash command, etc.)
 */
export const AGENT_MESSAGE_ROLE = {
  USER: "user",
  AGENT: "agent",
  SYSTEM: "system",
} as const;

export type AgentMessageRole = (typeof AGENT_MESSAGE_ROLE)[keyof typeof AGENT_MESSAGE_ROLE];
