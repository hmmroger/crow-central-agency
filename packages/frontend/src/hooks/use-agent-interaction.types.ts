import type { AgentMessage, AgentStatus, SessionUsage } from "@crow-central-agency/shared";

/** A pending permission request awaiting user response */
export interface PendingPermissionRequest {
  toolUseId: string;
  toolName: string;
  input?: Record<string, unknown>;
  decisionReason?: string;
}

/** Last query result info (displayed outside the message list) */
export interface QueryResult {
  subtype: string;
  costUsd?: number;
  durationMs?: number;
}

/** Real-time tool execution state (from agent_activity + agent_tool_progress WS events) */
export interface ActiveToolUse {
  toolName: string;
  description: string;
  elapsedTimeSeconds?: number;
}

/** Return type of useAgentInteraction hook */
export interface AgentInteractionState {
  /** Committed messages from backend (via REST or agent_message WS) */
  messages: AgentMessage[];
  /** Currently streaming text — display-only buffer, not a message */
  streamingText: string;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Current agent status */
  status: AgentStatus;
  /** Session usage stats */
  usage: SessionUsage;
  /** Pending permission requests awaiting user response */
  pendingPermissions: PendingPermissionRequest[];
  /** Last query result (cost, duration) — displayed outside message list */
  lastResult?: QueryResult;
  /** Currently executing tool — real-time indicator */
  activeToolUse?: ActiveToolUse;
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
  /** Allow a pending permission */
  allowPermission: (toolUseId: string) => void;
  /** Deny a pending permission (optionally with message for agent) */
  denyPermission: (toolUseId: string, message?: string) => void;
}
