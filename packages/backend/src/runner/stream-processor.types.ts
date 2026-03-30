import type { ServerMessage } from "@crow-central-agency/shared";
import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * A processed event yielded by the stream processor async generator.
 * The orchestrator iterates these and decides what to do with each piece.
 */
export interface ProcessedStreamEvent {
  /** Real-time WS messages to broadcast (agent_text, agent_activity, agent_status, etc.) */
  wsMessages: ServerMessage[];
  /** Complete assistant turn as SessionMessage — for session manager to transform and store */
  sessionMessage?: SessionMessage;
  /** Metadata updates captured from SDK events */
  meta?: StreamEventMeta;
}

/** Metadata extracted from SDK stream events */
export interface StreamEventMeta {
  /** Session ID from system.init */
  sessionId?: string;
  /** Discovered tools from system.init */
  discoveredTools?: string[];
  /** Per-turn usage from assistant messages */
  usage?: { inputTokens: number; outputTokens: number };
  /** Result info from the final result message */
  result?: StreamResultInfo;
  /** Status update (e.g., "compacting" from system.status) */
  status?: string;
}

/** Result information from the SDK result message */
export interface StreamResultInfo {
  success: boolean;
  subtype: string;
  totalCostUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  contextUsed?: number;
  contextTotal?: number;
}
