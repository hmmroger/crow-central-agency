import type { AgentStatus, SessionUsage } from "@crow-central-agency/shared";

/** Display message types for the agent console */
export const AGENT_MESSAGE_KIND = {
  TEXT: "text",
  ACTIVITY: "activity",
  RESULT: "result",
  USAGE: "usage",
} as const;

export type AgentMessageKind = (typeof AGENT_MESSAGE_KIND)[keyof typeof AGENT_MESSAGE_KIND];

/** A rendered message in the agent console */
export interface AgentMessage {
  id: string;
  kind: AgentMessageKind;
  /** Text content (for text messages) */
  text?: string;
  /** Tool name (for activity messages) */
  toolName?: string;
  /** Human-readable description (for activity messages) */
  description?: string;
  /** Whether this activity is from a subagent */
  isSubagent?: boolean;
  /** Result subtype — "success" or error type */
  subtype?: string;
  /** Cost in USD (for result messages) */
  costUsd?: number;
  /** Duration in ms (for result messages) */
  durationMs?: number;
  /** Timestamp */
  timestamp: number;
}

/** Return type of useAgentInteraction hook */
export interface AgentInteractionState {
  /** Rendered messages for the console */
  messages: AgentMessage[];
  /** Currently streaming text (not yet committed to messages) */
  streamingText: string;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Current agent status */
  status: AgentStatus;
  /** Session usage stats */
  usage: SessionUsage;
  /** Send a user message */
  sendMessage: (text: string) => void;
  /** Inject a btw message while streaming */
  injectMessage: (text: string) => void;
  /** Stop the agent */
  abort: () => Promise<void>;
  /** Start a new conversation */
  newConversation: () => Promise<void>;
  /** Trigger manual compaction (disabled while streaming) */
  compact: () => Promise<void>;
}
