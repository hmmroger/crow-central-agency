import { useQuery } from "@tanstack/react-query";
import type { InternalMcpConfig, McpServerConfig } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

export type AgentMcpConfig = McpServerConfig | InternalMcpConfig;

/**
 * Fetch MCP configs visible to a specific agent — persisted user configs plus
 * internal configurable servers (with `isDisabled` reflecting required-connection state).
 */
export function useAgentMcpConfigsQuery(agentId: string | undefined) {
  return useQuery<AgentMcpConfig[], ApiError>({
    queryKey: agentId ? agentKeys.mcpConfigs(agentId) : ["agents", "mcp-configs", "disabled"],
    queryFn: async () => {
      const response = await apiClient.get<AgentMcpConfig[]>(`/agents/${agentId}/mcp-configs`);
      return unwrapResponse(response);
    },
    enabled: !!agentId,
    refetchOnMount: "always",
  });
}
