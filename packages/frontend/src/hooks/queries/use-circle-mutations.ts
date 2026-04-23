import { useMutation } from "@tanstack/react-query";
import type { AgentCircle, CreateAgentCircleInput, UpdateAgentCircleInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Create a new circle.
 * Cache is updated via the WS circle_created event in useCirclesQuery.
 */
export function useCreateCircle() {
  return useMutation<AgentCircle, ApiError, CreateAgentCircleInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<AgentCircle>("/circles", input);
      return unwrapResponse(response);
    },
  });
}

/**
 * Update an existing circle.
 * Cache is updated via the WS circle_updated event in useCirclesQuery.
 */
export function useUpdateCircle() {
  return useMutation<AgentCircle, ApiError, { circleId: string; input: UpdateAgentCircleInput }>({
    mutationFn: async ({ circleId, input }) => {
      const response = await apiClient.patch<AgentCircle>(`/circles/${circleId}`, input);
      return unwrapResponse(response);
    },
  });
}

/**
 * Delete a circle.
 * Cache is updated via the WS circle_deleted event in useCirclesQuery.
 */
export function useDeleteCircle() {
  return useMutation<void, ApiError, string>({
    mutationFn: async (circleId) => {
      const response = await apiClient.del<void>(`/circles/${circleId}`);
      return unwrapResponse(response);
    },
  });
}
