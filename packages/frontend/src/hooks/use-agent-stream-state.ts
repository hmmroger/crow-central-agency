import { useCallback, useState } from "react";
import {
  AGENT_STATUS,
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentMessageWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentToolProgressWsMessageSchema,
} from "@crow-central-agency/shared";
import { useWsSubscription } from "./use-ws-subscription.js";
import type { QueryResult, ActiveToolUse } from "./agent-interaction.types.js";

/** Return type of useAgentStreamState */
export interface AgentStreamState {
  /** Currently streaming text — display-only buffer, not a message */
  streamingText: string;
  /** Currently executing tool — real-time indicator */
  activeToolUse: ActiveToolUse | undefined;
  /** Last query result (cost, duration) — displayed outside message list */
  lastResult: QueryResult | undefined;
  /** Reset all ephemeral state (for new conversation) */
  resetStreamState: () => void;
}

/**
 * Ephemeral WS-driven state for agent streaming display.
 * Manages streamingText, activeToolUse, and lastResult —
 * all transient display state with no REST endpoint and no cache value.
 *
 * @param agentId - The agent to subscribe to
 */
export function useAgentStreamState(agentId: string): AgentStreamState {
  const [streamingText, setStreamingText] = useState("");
  const [activeToolUse, setActiveToolUse] = useState<ActiveToolUse | undefined>();
  const [lastResult, setLastResult] = useState<QueryResult | undefined>();

  useWsSubscription(agentId, (data) => {
    const textParsed = AgentTextWsMessageSchema.safeParse(data);

    if (textParsed.success) {
      setStreamingText((prev) => prev + textParsed.data.text);

      return;
    }

    // Committed message — clear streaming display buffer
    const messageParsed = AgentMessageWsMessageSchema.safeParse(data);

    if (messageParsed.success) {
      setStreamingText("");
      setActiveToolUse(undefined);

      return;
    }

    const activityParsed = AgentActivityWsMessageSchema.safeParse(data);

    if (activityParsed.success) {
      setActiveToolUse({
        toolName: activityParsed.data.toolName,
        description: activityParsed.data.description,
      });

      return;
    }

    const toolProgressParsed = AgentToolProgressWsMessageSchema.safeParse(data);

    if (toolProgressParsed.success) {
      setActiveToolUse((prev) =>
        prev
          ? { ...prev, elapsedTimeSeconds: toolProgressParsed.data.elapsedTimeSeconds }
          : {
              toolName: toolProgressParsed.data.toolName,
              description: "",
              elapsedTimeSeconds: toolProgressParsed.data.elapsedTimeSeconds,
            }
      );

      return;
    }

    const resultParsed = AgentResultWsMessageSchema.safeParse(data);

    if (resultParsed.success) {
      setLastResult({
        subtype: resultParsed.data.subtype,
        costUsd: resultParsed.data.totalCostUsd,
        durationMs: resultParsed.data.durationMs,
      });
      setStreamingText("");
      setActiveToolUse(undefined);

      return;
    }

    const statusParsed = AgentStatusWsMessageSchema.safeParse(data);

    if (statusParsed.success) {
      // Clear stale result banner when a new query starts
      if (statusParsed.data.status === AGENT_STATUS.STREAMING) {
        setLastResult(undefined);
      }

      // Clear streaming state when agent becomes idle or errors
      if (statusParsed.data.status === AGENT_STATUS.IDLE) {
        setStreamingText("");
        setActiveToolUse(undefined);
      }

      return;
    }
  });

  const resetStreamState = useCallback(() => {
    setStreamingText("");
    setActiveToolUse(undefined);
    setLastResult(undefined);
  }, []);

  return { streamingText, activeToolUse, lastResult, resetStreamState };
}
