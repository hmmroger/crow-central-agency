import type { ServerMessage } from "@crow-central-agency/shared";

/** Callback to emit a WS message to the agent's subscribers */
export type StreamEmitter = (message: ServerMessage) => void;

/** Result from processing a complete query stream */
export interface StreamResult {
  /** Session ID captured from init message */
  sessionId?: string;
  /** Tools discovered from init message */
  discoveredTools?: string[];
  /** Whether the stream completed successfully */
  success: boolean;
  /** Error subtype if failed */
  errorSubtype?: string;
  /** Cost for this query */
  costUsd?: number;
  /** Cumulative session cost */
  totalCostUsd?: number;
  /** Wall clock duration */
  durationMs?: number;
  /** Input tokens for this query */
  inputTokens?: number;
  /** Output tokens for this query */
  outputTokens?: number;
  /** Context window used */
  contextUsed?: number;
  /** Context window total */
  contextTotal?: number;
}
