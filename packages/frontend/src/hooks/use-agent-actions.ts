import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CLIENT_MESSAGE_TYPE } from "@crow-central-agency/shared";
import { useWs } from "./use-ws.js";
import { apiClient } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";

/** Options for useAgentActions */
export interface UseAgentActionsOptions {
  /** Callback to optimistically remove a permission from local stream state */
  removePendingPermission: (toolUseId: string) => void;
}

/** Return type of useAgentActions */
export interface AgentActions {
  /** Send a user message — backend creates the AgentMessage and broadcasts via WS */
  sendMessage: (text: string) => void;
  /** Inject a btw message while streaming */
  injectMessage: (text: string) => void;
  /** Stop the agent */
  abort: () => Promise<void>;
  /** Start a new conversation — invalidates messages and state caches */
  newConversation: () => Promise<void>;
  /** Trigger manual compaction */
  compact: () => Promise<void>;
  /** Allow a pending permission request */
  allowPermission: (toolUseId: string) => void;
  /** Deny a pending permission request (optionally with a text message for the agent) */
  denyPermission: (toolUseId: string, message?: string) => void;
}

/**
 * Action callbacks for agent interaction.
 * Pure actions — no state. Uses WS for real-time commands, REST for lifecycle operations.
 * Invalidates React Query caches where needed (e.g. newConversation).
 *
 * @param agentId - The agent to act on
 * @param options - Callbacks for coordinating with local stream state
 */
export function useAgentActions(agentId: string, options: UseAgentActionsOptions): AgentActions {
  const { send } = useWs();
  const queryClient = useQueryClient();
  const { removePendingPermission } = options;

  /** Send a user message — backend creates the AgentMessage and broadcasts agent_message WS */
  const sendMessage = useCallback(
    (text: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.SEND_MESSAGE, agentId, message: text });
    },
    [send, agentId]
  );

  /** Inject a btw message while streaming */
  const injectMessage = useCallback(
    (text: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.INJECT_MESSAGE, agentId, message: text });
    },
    [send, agentId]
  );

  /** Stop the agent */
  const abort = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/stop`);
  }, [agentId]);

  /** Start a new conversation — invalidates query caches so they refetch clean state */
  const newConversation = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/session/new`);
    await queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
  }, [agentId, queryClient]);

  /** Trigger manual compaction */
  const compact = useCallback(async () => {
    await apiClient.post(`/agents/${agentId}/session/compact`);
  }, [agentId]);

  /** Allow a pending permission request */
  const allowPermission = useCallback(
    (toolUseId: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE, agentId, toolUseId, decision: "allow" });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  /** Deny a pending permission request (optionally with a text message for the agent) */
  const denyPermission = useCallback(
    (toolUseId: string, message?: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE, agentId, toolUseId, decision: "deny", message });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  return { sendMessage, injectMessage, abort, newConversation, compact, allowPermission, denyPermission };
}
