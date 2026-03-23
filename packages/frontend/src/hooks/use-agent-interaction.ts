import { useCallback, useEffect, useState } from "react";
import {
  AGENT_STATUS,
  AgentTextWsMessageSchema,
  AgentActivityWsMessageSchema,
  AgentResultWsMessageSchema,
  AgentStatusWsMessageSchema,
  AgentUsageWsMessageSchema,
  AgentMessageWsMessageSchema,
  AgentToolProgressWsMessageSchema,
  PermissionRequestWsMessageSchema,
  PermissionCancelledWsMessageSchema,
  type AgentMessage,
  type AgentStatus,
  type SessionUsage,
} from "@crow-central-agency/shared";
import { useWs } from "./use-ws.js";
import { useWsSubscription } from "./use-ws-subscription.js";
import { apiClient } from "../services/api-client.js";
import type {
  AgentInteractionState,
  PendingPermissionRequest,
  QueryResult,
  ActiveToolUse,
} from "./use-agent-interaction.types.js";

/**
 * Composite hook for agent console interaction.
 * Frontend is purely reactive — messages come only from backend (REST or agent_message WS).
 * streamingText is a display-only buffer. Frontend NEVER constructs AgentMessage objects.
 */
export function useAgentInteraction(agentId: string): AgentInteractionState {
  const { send } = useWs();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<AgentStatus>(AGENT_STATUS.IDLE);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermissionRequest[]>([]);
  const [lastResult, setLastResult] = useState<QueryResult | undefined>();
  const [activeToolUse, setActiveToolUse] = useState<ActiveToolUse | undefined>();
  const [usage, setUsage] = useState<SessionUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    contextUsed: 0,
    contextTotal: 0,
  });

  // Load initial state + messages from REST on mount
  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [stateResponse, messagesResponse] = await Promise.all([
          apiClient.get<{ status: AgentStatus; sessionUsage?: SessionUsage }>(`/agents/${agentId}/state`),
          apiClient.get<AgentMessage[]>(`/agents/${agentId}/messages`),
        ]);

        if (stateResponse.success && stateResponse.data) {
          setStatus(stateResponse.data.status);

          if (stateResponse.data.sessionUsage) {
            setUsage(stateResponse.data.sessionUsage);
          }
        }

        if (messagesResponse.success && messagesResponse.data.length > 0) {
          setMessages(messagesResponse.data);
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

      case "agent_message": {
        const parsed = AgentMessageWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setMessages((prev) => [...prev, parsed.data.message]);
          setStreamingText("");
          setActiveToolUse(undefined);
        }

        break;
      }

      case "agent_activity": {
        const parsed = AgentActivityWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setActiveToolUse({
            toolName: parsed.data.toolName,
            description: parsed.data.description,
          });
        }

        break;
      }

      case "agent_tool_progress": {
        const parsed = AgentToolProgressWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setActiveToolUse((prev) =>
            prev
              ? { ...prev, elapsedTimeSeconds: parsed.data.elapsedTimeSeconds }
              : { toolName: parsed.data.toolName, description: "", elapsedTimeSeconds: parsed.data.elapsedTimeSeconds }
          );
        }

        break;
      }

      case "agent_result": {
        const parsed = AgentResultWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setLastResult({
            subtype: parsed.data.subtype,
            costUsd: parsed.data.totalCostUsd ?? parsed.data.costUsd,
            durationMs: parsed.data.durationMs,
          });
          setStreamingText("");
          setActiveToolUse(undefined);
        }

        break;
      }

      case "agent_status": {
        const parsed = AgentStatusWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setStatus(parsed.data.status);

          // Clear stale result banner when a new query starts
          if (parsed.data.status === AGENT_STATUS.STREAMING) {
            setLastResult(undefined);
          }

          // Clear streaming state when agent becomes idle
          if (parsed.data.status === AGENT_STATUS.IDLE || parsed.data.status === AGENT_STATUS.ERROR) {
            setStreamingText("");
            setActiveToolUse(undefined);
          }
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

      case "permission_request": {
        const parsed = PermissionRequestWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setPendingPermissions((prev) => [
            ...prev,
            {
              toolUseId: parsed.data.toolUseId,
              toolName: parsed.data.toolName,
              input: parsed.data.input,
              decisionReason: parsed.data.decisionReason,
            },
          ]);
        }

        break;
      }

      case "permission_cancelled": {
        const parsed = PermissionCancelledWsMessageSchema.safeParse(data);

        if (parsed.success) {
          setPendingPermissions((prev) => prev.filter((perm) => perm.toolUseId !== parsed.data.toolUseId));
        }

        break;
      }

      default:
        break;
    }
  };

  useWsSubscription(agentId, handleWsMessage);

  /** Send a user message — backend creates the AgentMessage and broadcasts agent_message WS */
  const sendMessage = useCallback(
    (text: string) => {
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
    setLastResult(undefined);
    setActiveToolUse(undefined);
    setUsage({ inputTokens: 0, outputTokens: 0, totalCostUsd: 0, contextUsed: 0, contextTotal: 0 });
  }, [agentId]);

  /** Trigger manual compaction */
  const compact = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/session/compact`);
  }, [agentId]);

  /** Allow a pending permission request */
  const allowPermission = useCallback(
    (toolUseId: string) => {
      send({ type: "permission_response", agentId, toolUseId, decision: "allow" });
      setPendingPermissions((prev) => prev.filter((perm) => perm.toolUseId !== toolUseId));
    },
    [send, agentId]
  );

  /** Deny a pending permission request (optionally with a text message for the agent) */
  const denyPermission = useCallback(
    (toolUseId: string, message?: string) => {
      send({ type: "permission_response", agentId, toolUseId, decision: "deny", message });
      setPendingPermissions((prev) => prev.filter((perm) => perm.toolUseId !== toolUseId));
    },
    [send, agentId]
  );

  // Only STREAMING is truly "streaming" — WAITING_PERMISSION is a paused state
  const isStreaming = status === AGENT_STATUS.STREAMING;

  return {
    messages,
    streamingText,
    isStreaming,
    status,
    usage,
    pendingPermissions,
    lastResult,
    activeToolUse,
    sendMessage,
    injectMessage,
    abort,
    newConversation,
    compact,
    allowPermission,
    denyPermission,
  };
}
