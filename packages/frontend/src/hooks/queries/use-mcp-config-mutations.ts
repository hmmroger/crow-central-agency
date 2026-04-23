import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { McpServerConfig, CreateMcpConfigInput, UpdateMcpConfigInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { mcpConfigKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Create a new MCP config. Invalidates list on success.
 */
export function useCreateMcpConfig() {
  const queryClient = useQueryClient();

  return useMutation<McpServerConfig, ApiError, CreateMcpConfigInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<McpServerConfig>("/mcp/configs", input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpConfigKeys.list() });
    },
  });
}

/**
 * Update an existing MCP config. Invalidates detail and list on success.
 */
export function useUpdateMcpConfig(configId: string) {
  const queryClient = useQueryClient();

  return useMutation<McpServerConfig, ApiError, UpdateMcpConfigInput>({
    mutationFn: async (input) => {
      const response = await apiClient.patch<McpServerConfig>(`/mcp/configs/${configId}`, input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mcpConfigKeys.list() });
    },
  });
}

/**
 * Delete an MCP config. Optimistically removes from list, rolls back on error.
 */
export function useDeleteMcpConfig(configId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, ApiError, void, { previous: McpServerConfig[] | undefined }>({
    mutationFn: async () => {
      const response = await apiClient.del<void>(`/mcp/configs/${configId}`);

      return unwrapResponse(response);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: mcpConfigKeys.list() });
      const previous = queryClient.getQueryData<McpServerConfig[]>(mcpConfigKeys.list());
      queryClient.setQueryData<McpServerConfig[]>(mcpConfigKeys.list(), (old) =>
        old?.filter((config) => config.id !== configId)
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(mcpConfigKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: mcpConfigKeys.list() });
    },
  });

  const { mutateAsync } = mutation;

  /** Wrapped delete function matching component callback expectations */
  const deleteFn = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return { ...mutation, deleteFn };
}
