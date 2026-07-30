import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Relationship,
  CreateRelationshipInput,
  DeleteRelationshipResult,
  GraphData,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { fragmentKeys, graphKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Create a relationship. The relationships list and graph caches refresh via the
 * WS relationship_created event; the relationship-candidate caches are invalidated
 * here so an open picker immediately drops the option that was just linked.
 */
export function useCreateRelationship() {
  const queryClient = useQueryClient();

  return useMutation<Relationship, ApiError, CreateRelationshipInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<Relationship>("/relationships", input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: fragmentKeys.relationshipCandidatesRoot() });
    },
  });
}

/**
 * Delete a relationship by ID. Returns the fragment ids collected by the delete
 * cascade (empty for MEMBERSHIP). The relationships list cache is updated via the
 * WS relationship_deleted event; the graph cache is pruned here so dependent views
 * update without waiting for the round trip.
 */
export function useDeleteRelationship() {
  const queryClient = useQueryClient();

  return useMutation<DeleteRelationshipResult, ApiError, string>({
    mutationFn: async (relationshipId) => {
      const response = await apiClient.del<DeleteRelationshipResult>(`/relationships/${relationshipId}`);
      return unwrapResponse(response);
    },
    onSuccess: (result, relationshipId) => {
      const collected = new Set(result.collectedFragmentIds);

      queryClient.setQueryData<GraphData>(graphKeys.data(), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          nodes: previous.nodes.filter((node) => !collected.has(node.id)),
          edges: previous.edges.filter(
            (edge) => edge.id !== relationshipId && !collected.has(edge.source) && !collected.has(edge.target)
          ),
        };
      });

      void queryClient.invalidateQueries({ queryKey: fragmentKeys.relationshipCandidatesRoot() });
    },
  });
}
