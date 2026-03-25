import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentConfig, CreateAgentInput, UpdateAgentInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import type { ApiError } from "../services/api-client.types.js";

/**
 * Create a new agent. Invalidates agents list on success.
 */
export function useCreateAgent() {
  const queryClient = useQueryClient();

  return useMutation<AgentConfig, ApiError, CreateAgentInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<AgentConfig>("/agents", input);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

/**
 * Update an existing agent. Invalidates agent detail and list on success.
 */
export function useUpdateAgent(agentId: string) {
  const queryClient = useQueryClient();

  return useMutation<AgentConfig, ApiError, UpdateAgentInput>({
    mutationFn: async (input) => {
      const response = await apiClient.patch<AgentConfig>(`/agents/${agentId}`, input);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
    },
  });
}

/**
 * Delete an agent. Optimistically removes from list, rolls back on error.
 */
export function useDeleteAgent(agentId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, ApiError, void, { previous: AgentConfig[] | undefined }>({
    mutationFn: async () => {
      const response = await apiClient.del<void>(`/agents/${agentId}`);

      return unwrapResponse(response);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: agentKeys.list() });

      const previous = queryClient.getQueryData<AgentConfig[]>(agentKeys.list());

      queryClient.setQueryData<AgentConfig[]>(agentKeys.list(), (old) => old?.filter((agent) => agent.id !== agentId));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(agentKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.list() });
      queryClient.removeQueries({ queryKey: agentKeys.detail(agentId) });
    },
  });

  /** Wrapped mutate that returns void to match component callback expectations */
  const { mutateAsync } = mutation;

  const deleteFn = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return { ...mutation, deleteFn };
}
