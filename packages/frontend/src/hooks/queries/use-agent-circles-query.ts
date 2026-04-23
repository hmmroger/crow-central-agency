import { useQuery } from "@tanstack/react-query";
import type { AgentCircle } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch circles that an agent is a direct member of.
 */
export function useAgentCirclesQuery(agentId: string) {
  return useQuery<AgentCircle[], ApiError>({
    queryKey: agentKeys.circles(agentId),
    queryFn: async () => {
      const response = await apiClient.get<AgentCircle[]>(`/agents/${agentId}/circles`);
      return unwrapResponse(response);
    },
  });
}
