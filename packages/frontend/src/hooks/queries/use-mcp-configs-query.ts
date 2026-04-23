import { useQuery } from "@tanstack/react-query";
import type { McpServerConfig } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { mcpConfigKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch MCP server configs via React Query.
 * No WebSocket integration — MCP configs only change from the Settings UI,
 * so simple invalidation on mutation success is sufficient.
 */
export function useMcpConfigsQuery() {
  return useQuery<McpServerConfig[], ApiError>({
    queryKey: mcpConfigKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<McpServerConfig[]>("/mcp/configs");
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}
