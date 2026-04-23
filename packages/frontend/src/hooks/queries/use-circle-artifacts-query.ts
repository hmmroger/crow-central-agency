import { useQuery } from "@tanstack/react-query";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch circle artifacts accessible to an agent via React Query.
 */
export function useCircleArtifactsQuery(agentId: string) {
  return useQuery<ArtifactMetadata[], ApiError>({
    queryKey: agentKeys.circleArtifacts(agentId),
    queryFn: async () => {
      const response = await apiClient.get<ArtifactMetadata[]>(`/agents/${agentId}/circle-artifacts`);
      return unwrapResponse(response);
    },
  });
}
