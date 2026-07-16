import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Return type of useNewConversation */
export interface NewConversation {
  /** Start a new conversation - invalidates the agent's query caches */
  newConversation: () => void;
}

/**
 * Start a new agent conversation via REST.
 * POSTs /agents/:id/session/new and invalidates the agent detail cache.
 * Stream buffers clear via the WS IDLE/AGENT_MESSAGE paths, so no local reset is needed.
 *
 * @param agentId - The agent to start a new conversation for
 */
export function useNewConversation(agentId: string): NewConversation {
  const queryClient = useQueryClient();

  const newConversationMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/new`);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    },
    onError: (error) => {
      console.error(`[newConversation] failed for agent ${agentId}:`, error.message);
    },
  });

  const { mutate: newConversationMutate } = newConversationMutation;
  const newConversation = useCallback(() => newConversationMutate(), [newConversationMutate]);

  return { newConversation };
}
