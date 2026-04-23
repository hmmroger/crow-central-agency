import { useMutation } from "@tanstack/react-query";
import type { Relationship, CreateRelationshipInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Create a relationship.
 * Cache is updated via the WS relationship_created event in useRelationshipsQuery.
 */
export function useCreateRelationship() {
  return useMutation<Relationship, ApiError, CreateRelationshipInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<Relationship>("/relationships", input);
      return unwrapResponse(response);
    },
  });
}

/**
 * Delete a relationship by ID.
 * Cache is updated via the WS relationship_deleted event in useRelationshipsQuery.
 */
export function useDeleteRelationship() {
  return useMutation<void, ApiError, string>({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.del<void>(`/relationships/${relationshipId}`);
      return unwrapResponse(response);
    },
  });
}
