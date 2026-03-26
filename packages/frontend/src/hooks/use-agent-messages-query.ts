import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AgentMessageWsMessageSchema, type AgentMessage } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import { useWsSubscription } from "./use-ws-subscription.js";
import type { ApiError } from "../services/api-client.types.js";

/**
 * Fetch agent messages via React Query, kept fresh by WS events.
 * WS `agent_message` events append to the cache directly.
 * Uses staleTime: Infinity — no background refetch needed.
 *
 * @param agentId - The agent whose messages to fetch
 */
export function useAgentMessagesQuery(agentId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<AgentMessage[], ApiError>({
    queryKey: agentKeys.messages(agentId),
    queryFn: async () => {
      const response = await apiClient.get<AgentMessage[]>(`/agents/${agentId}/messages`);

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useWsSubscription(agentId, (data) => {
    const parsed = AgentMessageWsMessageSchema.safeParse(data);

    if (parsed.success) {
      queryClient.setQueryData<AgentMessage[]>(agentKeys.messages(agentId), (prev) => {
        return [...(prev ?? []), parsed.data.message];
      });
    }
  });

  return query;
}
