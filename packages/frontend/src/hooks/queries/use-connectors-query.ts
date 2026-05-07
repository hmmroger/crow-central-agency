import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectConnectorResponse, ConnectorInfo } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { connectorKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Fetch the registered connectors for a given agent, with the agent's connection status. */
export function useConnectorsQuery(agentId: string | undefined) {
  return useQuery<ConnectorInfo[], ApiError>({
    queryKey: connectorKeys.listForAgent(agentId ?? ""),
    queryFn: async () => {
      const response = await apiClient.get<ConnectorInfo[]>(`/agents/${agentId}/connectors`);
      return unwrapResponse(response);
    },
    enabled: !!agentId,
    refetchOnMount: "always",
  });
}

/**
 * Begin connecting an OAuth connector for the given agent. The mutation
 * returns the auth URL; the caller is responsible for navigating the
 * browser there.
 */
export function useConnectConnector() {
  return useMutation<ConnectConnectorResponse, ApiError, { agentId: string; id: string }>({
    mutationFn: async ({ agentId, id }) => {
      const response = await apiClient.post<ConnectConnectorResponse>(`/agents/${agentId}/connectors/${id}/connect`);
      return unwrapResponse(response);
    },
  });
}

/** Disconnect a connector for the given agent. Invalidates the agent's connector list on success. */
export function useDisconnectConnector() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { agentId: string; id: string }>({
    mutationFn: async ({ agentId, id }) => {
      const response = await apiClient.del<void>(`/agents/${agentId}/connectors/${id}`);
      return unwrapResponse(response);
    },
    onSuccess: (_data, { agentId }) => {
      void queryClient.invalidateQueries({ queryKey: connectorKeys.listForAgent(agentId) });
    },
  });
}
