import { useState } from "react";
import { AGENT_STATUS, SERVER_MESSAGE_TYPE } from "@crow-central-agency/shared";
import { useWsSubscription } from "../use-ws-subscription.js";
import type { QueryResult, ActiveToolUse } from "./use-agent-stream-state.types.js";

/** Return type of useAgentStreamState */
export interface AgentStreamState {
  /** Currently streaming text - display-only buffer, not a message */
  streamingText: string;
  /** Currently executing tool - real-time indicator */
  activeToolUse: ActiveToolUse | undefined;
  /** Last query result (cost, duration) - displayed outside message list */
  lastResult: QueryResult | undefined;
}

/**
 * Ephemeral WS-driven state for agent streaming display.
 * Manages streamingText, activeToolUse, and lastResult -
 * all transient display state with no REST endpoint and no cache value.
 *
 * @param agentId - The agent to subscribe to
 */
export function useAgentStreamState(agentId: string): AgentStreamState {
  const [streamingText, setStreamingText] = useState("");
  const [activeToolUse, setActiveToolUse] = useState<ActiveToolUse | undefined>();
  const [lastResult, setLastResult] = useState<QueryResult | undefined>();

  useWsSubscription(agentId, (message) => {
    if (message.type === SERVER_MESSAGE_TYPE.AGENT_TEXT) {
      setStreamingText((prev) => prev + message.text);

      return;
    }

    // Committed message - clear streaming display buffer
    if (message.type === SERVER_MESSAGE_TYPE.AGENT_MESSAGE) {
      setStreamingText("");
      setActiveToolUse(undefined);

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.AGENT_TOOL_PROGRESS) {
      setActiveToolUse((prev) =>
        prev
          ? { ...prev, elapsedTimeSeconds: message.elapsedTimeSeconds }
          : {
              toolName: message.toolName,
              description: "",
              elapsedTimeSeconds: message.elapsedTimeSeconds,
            }
      );

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.AGENT_RESULT) {
      setLastResult({
        subtype: message.subtype,
        costUsd: message.totalCostUsd,
        durationMs: message.durationMs,
      });
      setStreamingText("");
      setActiveToolUse(undefined);

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.AGENT_STATUS) {
      // Clear stale result banner when a new query starts
      if (message.status === AGENT_STATUS.STREAMING) {
        setLastResult(undefined);
      }

      // Clear streaming state when agent becomes idle or errors
      if (message.status === AGENT_STATUS.IDLE) {
        setStreamingText("");
        setActiveToolUse(undefined);
      }
    }
  });

  return { streamingText, activeToolUse, lastResult };
}
