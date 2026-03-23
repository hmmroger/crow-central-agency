import { useCallback, useEffect, useState } from "react";
import { AGENT_STATUS, type AgentStatus, type SessionUsage } from "@crow-central-agency/shared";
import { useWs } from "./use-ws.js";
import { useWsSubscription } from "./use-ws-subscription.js";
import { apiClient } from "../services/api-client.js";
import { AGENT_MESSAGE_KIND, type AgentMessage, type AgentInteractionState } from "./use-agent-interaction.types.js";

let messageCounter = 0;

function nextId(): string {
  messageCounter += 1;

  return `msg-${messageCounter}`;
}

/**
 * Composite hook for agent console interaction.
 * Manages local render state, WS subscriptions, and API actions.
 * Backend is source of truth — local state is for display only.
 */
export function useAgentInteraction(agentId: string): AgentInteractionState {
  const { send } = useWs();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<AgentStatus>(AGENT_STATUS.IDLE);
  const [usage, setUsage] = useState<SessionUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    contextUsed: 0,
    contextTotal: 0,
  });

  // Load initial messages from REST on mount
  useEffect(() => {
    const loadMessages = async () => {
      const stateResponse = await apiClient.get<{ status: AgentStatus; sessionUsage?: SessionUsage }>(
        `/agents/${agentId}/state`
      );

      if (stateResponse.success && stateResponse.data) {
        setStatus(stateResponse.data.status);

        if (stateResponse.data.sessionUsage) {
          setUsage(stateResponse.data.sessionUsage);
        }
      }
    };

    loadMessages();
  }, [agentId]);

  // Handle incoming WS messages
  const handleWsMessage = useCallback((data: { type: string; [key: string]: unknown }) => {
    switch (data.type) {
      case "agent_text": {
        setStreamingText((prev) => prev + (data.text as string));
        break;
      }

      case "agent_activity": {
        // Flush streaming text as a text message before adding activity
        setStreamingText((prev) => {
          if (prev.length > 0) {
            setMessages((msgs) => [
              ...msgs,
              { id: nextId(), kind: AGENT_MESSAGE_KIND.TEXT, text: prev, timestamp: Date.now() },
            ]);
          }

          return "";
        });

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: AGENT_MESSAGE_KIND.ACTIVITY,
            toolName: data.toolName as string,
            description: data.description as string,
            isSubagent: data.isSubagent as boolean,
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case "agent_result": {
        // Flush any remaining streaming text
        setStreamingText((prev) => {
          if (prev.length > 0) {
            setMessages((msgs) => [
              ...msgs,
              { id: nextId(), kind: AGENT_MESSAGE_KIND.TEXT, text: prev, timestamp: Date.now() },
            ]);
          }

          return "";
        });

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: AGENT_MESSAGE_KIND.RESULT,
            subtype: data.subtype as string,
            costUsd: data.totalCostUsd as number | undefined,
            durationMs: data.durationMs as number | undefined,
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case "agent_status": {
        setStatus(data.status as AgentStatus);
        break;
      }

      case "agent_usage": {
        setUsage({
          inputTokens: data.inputTokens as number,
          outputTokens: data.outputTokens as number,
          totalCostUsd: data.totalCostUsd as number,
          contextUsed: data.contextUsed as number,
          contextTotal: data.contextTotal as number,
        });
        break;
      }

      default:
        break;
    }
  }, []);

  useWsSubscription(agentId, handleWsMessage);

  /** Send a user message */
  const sendMessage = useCallback(
    (text: string) => {
      // Add user message to local state
      setMessages((prev) => [
        ...prev,
        { id: nextId(), kind: AGENT_MESSAGE_KIND.TEXT, text: `**You:** ${text}`, timestamp: Date.now() },
      ]);

      send({ type: "send_message", agentId, message: text });
    },
    [send, agentId]
  );

  /** Inject a btw message while streaming */
  const injectMessage = useCallback(
    (text: string) => {
      send({ type: "btw_message", agentId, message: text });
    },
    [send, agentId]
  );

  /** Stop the agent */
  const abort = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/stop`);
  }, [agentId]);

  /** Start a new conversation */
  const newConversation = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/session/new`);
    setMessages([]);
    setStreamingText("");
    setUsage({ inputTokens: 0, outputTokens: 0, totalCostUsd: 0, contextUsed: 0, contextTotal: 0 });
  }, [agentId]);

  /** Trigger manual compaction */
  const compact = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/session/compact`);
  }, [agentId]);

  const isStreaming = status === AGENT_STATUS.STREAMING || status === AGENT_STATUS.WAITING_PERMISSION;

  return {
    messages,
    streamingText,
    isStreaming,
    status,
    usage,
    sendMessage,
    injectMessage,
    abort,
    newConversation,
    compact,
  };
}
