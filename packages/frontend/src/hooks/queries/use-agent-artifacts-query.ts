import { useQuery } from "@tanstack/react-query";
import type { ArtifactMetadata } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch artifact list for an agent via React Query.
 */
export function useAgentArtifactsQuery(agentId: string) {
  return useQuery<ArtifactMetadata[], ApiError>({
    queryKey: agentKeys.artifacts(agentId),
    queryFn: async () => {
      const response = await apiClient.get<ArtifactMetadata[]>(`/agents/${agentId}/artifacts`);
      return unwrapResponse(response);
    },
  });
}
