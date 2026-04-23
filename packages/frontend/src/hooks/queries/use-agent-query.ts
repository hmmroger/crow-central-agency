import { useQuery } from "@tanstack/react-query";
import type { AgentConfig } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Agent data as returned by the detail query (config + optional agentMd) */
export type AgentDetailData = AgentConfig & { agentMd?: string };

/**
 * Fetch a single agent config for editing.
 * Only enabled when agentId is provided (create mode skips the fetch).
 */
export function useAgentQuery(agentId: string | undefined) {
  return useQuery<AgentDetailData, ApiError>({
    queryKey: agentId ? agentKeys.detail(agentId) : agentKeys.all,
    queryFn: async () => {
      const response = await apiClient.get<AgentDetailData>(`/agents/${agentId}`);
      return unwrapResponse(response);
    },
    enabled: agentId !== undefined,
  });
}
