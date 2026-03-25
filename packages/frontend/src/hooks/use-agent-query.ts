import { useQuery } from "@tanstack/react-query";
import type { AgentConfig } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import type { ApiError } from "../services/api-client.types.js";

/**
 * Fetch a single agent config for editing.
 * Only enabled when agentId is provided (create mode skips the fetch).
 */
export function useAgentQuery(agentId: string | undefined) {
  return useQuery<AgentConfig & { agentMd?: string }, ApiError>({
    queryKey: agentId ? agentKeys.detail(agentId) : agentKeys.all,
    queryFn: async () => {
      const response = await apiClient.get<AgentConfig & { agentMd?: string }>(`/agents/${agentId}`);

      return unwrapResponse(response);
    },
    enabled: agentId !== undefined,
  });
}
