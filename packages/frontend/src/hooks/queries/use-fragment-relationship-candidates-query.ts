import { useQuery } from "@tanstack/react-query";
import type { FragmentRelationshipEntity, RelationshipDirection } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { fragmentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch the entities a fragment may form a new relationship with in the given
 * direction. Each direction caches under its own key so toggling back is
 * instant.
 */
export function useFragmentRelationshipCandidatesQuery(fragmentId: string, direction: RelationshipDirection) {
  return useQuery<FragmentRelationshipEntity[], ApiError>({
    queryKey: fragmentKeys.relationshipCandidates(fragmentId, direction),
    queryFn: async () => {
      const query = new URLSearchParams({ direction });
      const response = await apiClient.get<FragmentRelationshipEntity[]>(
        `/fragments/${fragmentId}/relationship-candidates?${query.toString()}`
      );

      return unwrapResponse(response);
    },
    enabled: Boolean(fragmentId),
  });
}
