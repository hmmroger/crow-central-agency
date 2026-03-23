import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENT_STATUS,
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentUsageWsMessageSchema,
  type AgentStatus,
  type SessionUsage,
} from "@crow-central-agency/shared";
import { useWs } from "./use-ws.js";
import { useWsSubscription } from "./use-ws-subscription.js";
import { apiClient } from "../services/api-client.js";
import { AGENT_MESSAGE_KIND, type AgentMessage, type AgentInteractionState } from "./use-agent-interaction.types.js";

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

  // Per-instance message counter (not module-level, scoped to hook instance)
  const messageCounterRef = useRef(0);

  function nextId(): string {
    messageCounterRef.current += 1;

    return `msg-${messageCounterRef.current}`;
  }

  // Load initial state + messages from REST on mount
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [stateResponse, messagesResponse] = await Promise.all([
          apiClient.get<{ status: AgentStatus; sessionUsage?: SessionUsage }>(`/agents/${agentId}/state`),
          apiClient.get<{ type: string; message: unknown }[]>(`/agents/${agentId}/messages`),
        ]);

        if (stateResponse.success && stateResponse.data) {
          setStatus(stateResponse.data.status);

          if (stateResponse.data.sessionUsage) {
            setUsage(stateResponse.data.sessionUsage);
          }
        }

        if (messagesResponse.success && messagesResponse.data.length > 0) {
          const rendered = messagesResponse.data
            .filter((sessionMsg) => sessionMsg.type === "user" || sessionMsg.type === "assistant")
            .map(
              (sessionMsg): AgentMessage => ({
                id: nextId(),
                kind: AGENT_MESSAGE_KIND.TEXT,
                text: typeof sessionMsg.message === "string" ? sessionMsg.message : JSON.stringify(sessionMsg.message),
                timestamp: Date.now(),
              })
            );

          setMessages(rendered);
        }
      } catch {
        // Errors on initial load are non-fatal — console starts empty
      }
    };

    loadInitialState();
  }, [agentId]);

  // Handle incoming WS messages — plain function, stabilized by useWsSubscription's useRef
  const handleWsMessage = (data: { type: string; [key: string]: unknown }) => {
    switch (data.type) {
      case "agent_text": {
        const parsed = AgentTextWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setStreamingText((prev) => prev + parsed.data.text);
        }

        break;
      }

      case "agent_activity": {
        const parsed = AgentActivityWsMessageSchema.safeParse(data);

        if (!parsed.success) {
          break;
        }

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
            toolName: parsed.data.toolName,
            description: parsed.data.description,
            isSubagent: parsed.data.isSubagent,
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case "agent_result": {
        const parsed = AgentResultWsMessageSchema.safeParse(data);

        if (!parsed.success) {
          break;
        }

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
            subtype: parsed.data.subtype,
            costUsd: parsed.data.totalCostUsd ?? parsed.data.costUsd,
            durationMs: parsed.data.durationMs,
            timestamp: Date.now(),
          },
        ]);
        break;
      }

      case "agent_status": {
        const parsed = AgentStatusWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setStatus(parsed.data.status);
        }

        break;
      }

      case "agent_usage": {
        const parsed = AgentUsageWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setUsage({
            inputTokens: parsed.data.inputTokens,
            outputTokens: parsed.data.outputTokens,
            totalCostUsd: parsed.data.totalCostUsd,
            contextUsed: parsed.data.contextUsed,
            contextTotal: parsed.data.contextTotal,
          });
        }

        break;
      }

      default:
        break;
    }
  };

  useWsSubscription(agentId, handleWsMessage);

  /** Send a user message */
  const sendMessage = useCallback(
    (text: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, kind: AGENT_MESSAGE_KIND.TEXT, text: `**You:** ${text}`, timestamp: Date.now() },
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

  // Only STREAMING is truly "streaming" — WAITING_PERMISSION is a paused state (Phase 3)
  const isStreaming = status === AGENT_STATUS.STREAMING;

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
