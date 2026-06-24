import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AgentBuilderDraftView,
  AgentBuilderDraftMutationResponse,
  AgentBuilderDesignRequest,
  AgentBuilderPatchRequest,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentBuilderKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Design or refine the fleet from a requirement, returning the updated draft. Invalidates the draft
 * query on success so the board re-renders from the backend.
 */
export function useDesignFleet() {
  const queryClient = useQueryClient();

  return useMutation<AgentBuilderDraftView, ApiError, AgentBuilderDesignRequest>({
    mutationFn: async (input) => {
      const response = await apiClient.post<AgentBuilderDraftMutationResponse>("/agent-builder/design", input);
      return unwrapResponse(response).draft;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
    },
  });
}

/**
 * Set the draft's fleet-level config (project path + agent type). The PATCH has replace semantics, so
 * callers send both fields. Returns the updated draft and invalidates the draft query on success.
 */
export function useSetFleetConfig() {
  const queryClient = useQueryClient();

  return useMutation<AgentBuilderDraftView, ApiError, AgentBuilderPatchRequest>({
    mutationFn: async (input) => {
      const response = await apiClient.patch<AgentBuilderDraftMutationResponse>("/agent-builder/draft", input);
      return unwrapResponse(response).draft;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
    },
  });
}

/**
 * Start building the drafted fleet (best-effort, server-orchestrated). Returns immediately (202); the
 * build runs server-side and its progress/outcome reach the draft via the draft-updated WS broadcast,
 * so this mutation does not own the page busy state — `draft.status` does.
 */
export function useBuildFleet() {
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      const response = await apiClient.post<void>("/agent-builder/build");
      return unwrapResponse(response);
    },
  });
}

/**
 * Clear the active draft entirely. Invalidates the draft query on success.
 */
export function useResetDraft() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      const response = await apiClient.del<void>("/agent-builder/draft");
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
    },
  });
}
