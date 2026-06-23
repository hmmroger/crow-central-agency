import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AgentBuilderDraftView,
  AgentBuilderDesignRequest,
  AgentBuilderPatchRequest,
  AgentBuilderBuildResult,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentBuilderKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

interface DraftMutationResponse {
  draft: AgentBuilderDraftView;
}

interface BuildMutationResponse {
  result: AgentBuilderBuildResult;
}

/**
 * Design or refine the fleet from a requirement, returning the updated draft. Invalidates the draft
 * query on success so the board re-renders from the backend.
 */
export function useDesignFleet() {
  const queryClient = useQueryClient();

  return useMutation<AgentBuilderDraftView, ApiError, AgentBuilderDesignRequest>({
    mutationFn: async (input) => {
      const response = await apiClient.post<DraftMutationResponse>("/agent-builder/design", input);
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
      const response = await apiClient.patch<DraftMutationResponse>("/agent-builder/draft", input);
      return unwrapResponse(response).draft;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
    },
  });
}

/**
 * Build the drafted fleet (best-effort, server-orchestrated). Returns the per-agent created/failed
 * result and invalidates the draft query — the board then reflects the post-build draft (succeeded
 * agents removed server-side, failed agents remaining, empty on full success).
 */
export function useBuildFleet() {
  const queryClient = useQueryClient();

  return useMutation<AgentBuilderBuildResult, ApiError, void>({
    mutationFn: async () => {
      const response = await apiClient.post<BuildMutationResponse>("/agent-builder/build");
      return unwrapResponse(response).result;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentBuilderKeys.draft() });
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
