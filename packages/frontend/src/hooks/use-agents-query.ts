import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentUpdatedWsMessageSchema, type AgentConfig } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import { useWs } from "./use-ws.js";
import type { ApiError } from "../services/api-client.types.js";

/**
 * Fetch agent list via React Query, kept fresh by WS events.
 * Uses staleTime: Infinity because WS `agent_updated` events
 * update the query cache directly — no background refetch needed.
 */
export function useAgentsQuery() {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<AgentConfig[], ApiError>({
    queryKey: agentKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgentConfig[]>("/agents");

      return unwrapResponse(response);
    },
    staleTime: Infinity,
  });

  // WS listener updates cache directly instead of triggering refetch
  useEffect(() => {
    const unregister = onMessage((raw) => {
      // Handle agent_updated — full config refresh
      const updatedResult = AgentUpdatedWsMessageSchema.safeParse(raw);

      if (updatedResult.success) {
        const { agentId, config } = updatedResult.data;

        queryClient.setQueryData<AgentConfig[]>(agentKeys.list(), (prev) => {
          if (!prev) {
            return [config];
          }

          const index = prev.findIndex((agent) => agent.id === agentId);

          if (index >= 0) {
            const updated = [...prev];
            updated[index] = config;

            return updated;
          }

          // New agent — append
          return [...prev, config];
        });

        return;
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  return query;
}
