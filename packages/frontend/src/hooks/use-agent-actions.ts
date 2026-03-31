import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CLIENT_MESSAGE_TYPE, PERMISSION_DECISION, type AgentRuntimeState } from "@crow-central-agency/shared";
import { useWs } from "./use-ws.js";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import type { ApiError } from "../services/api-client.types.js";

/** Options for useAgentActions */
export interface UseAgentActionsOptions {
  /** Reset all ephemeral stream state (for new conversation) */
  resetStreamState: () => void;
}

/** Return type of useAgentActions */
export interface AgentActions {
  /** Send a user message - backend creates the AgentMessage and broadcasts via WS */
  sendMessage: (text: string) => void;
  /** Inject a btw message while streaming */
  injectMessage: (text: string) => void;
  /** Stop the agent */
  abort: () => void;
  /** Start a new conversation - invalidates messages and state caches */
  newConversation: () => void;
  /** Trigger manual compaction */
  compact: () => void;
  /** Allow a pending permission request */
  allowPermission: (toolUseId: string) => void;
  /** Deny a pending permission request (optionally with a text message for the agent) */
  denyPermission: (toolUseId: string, message?: string) => void;
}

/**
 * Action callbacks for agent interaction.
 * WS sends for real-time commands, useMutation for REST lifecycle operations.
 *
 * @param agentId - The agent to act on
 * @param options - Callbacks for coordinating with local stream state
 */
export function useAgentActions(agentId: string, options: UseAgentActionsOptions): AgentActions {
  const { send } = useWs();
  const queryClient = useQueryClient();
  const { resetStreamState } = options;

  /** Send a user message - backend creates the AgentMessage and broadcasts agent_message WS */
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
  const abortMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/stop`);

      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[abort] failed for agent ${agentId}:`, error.message);
    },
  });

  /** Start a new conversation - clears ephemeral state and invalidates query caches */
  const newConversationMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/new`);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      resetStreamState();
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
    onError: (error) => {
      console.error(`[newConversation] failed for agent ${agentId}:`, error.message);
    },
  });

  /** Trigger manual compaction */
  const compactMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/compact`);

      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[compact] failed for agent ${agentId}:`, error.message);
    },
  });

  /** Optimistically remove a pending permission from the query cache */
  const removePendingPermission = useCallback(
    (toolUseId: string) => {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          pendingPermissions: prev.pendingPermissions?.filter((perm) => perm.toolUseId !== toolUseId),
        };
      });
    },
    [queryClient, agentId]
  );

  /** Allow a pending permission request */
  const allowPermission = useCallback(
    (toolUseId: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE, agentId, toolUseId, decision: PERMISSION_DECISION.ALLOW });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  /** Deny a pending permission request (optionally with a text message for the agent) */
  const denyPermission = useCallback(
    (toolUseId: string, message?: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE,
        agentId,
        toolUseId,
        decision: PERMISSION_DECISION.DENY,
        message,
      });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  const { mutate: abortMutate } = abortMutation;
  const { mutate: newConversationMutate } = newConversationMutation;
  const { mutate: compactMutate } = compactMutation;

  const abort = useCallback(() => abortMutate(), [abortMutate]);
  const newConversation = useCallback(() => newConversationMutate(), [newConversationMutate]);
  const compact = useCallback(() => compactMutate(), [compactMutate]);

  return { sendMessage, injectMessage, abort, newConversation, compact, allowPermission, denyPermission };
}
