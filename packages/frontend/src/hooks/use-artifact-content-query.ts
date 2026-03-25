import { useQuery } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import type { ApiError } from "../services/api-client.types.js";

interface ArtifactContent {
  filename: string;
  content: string;
}

/**
 * Fetch artifact file content via React Query.
 */
export function useArtifactContentQuery(agentId: string, filename: string) {
  return useQuery<ArtifactContent, ApiError>({
    queryKey: agentKeys.artifactContent(agentId, filename),
    queryFn: async () => {
      const response = await apiClient.get<ArtifactContent>(
        `/agents/${agentId}/artifacts/${encodeURIComponent(filename)}`
      );

      return unwrapResponse(response);
    },
  });
}
