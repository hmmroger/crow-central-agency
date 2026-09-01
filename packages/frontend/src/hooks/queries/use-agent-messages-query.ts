import { useQueryClient, useQuery } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useWsSubscription } from "../use-ws-subscription.js";
import { useBranchInFlight } from "../../stores/compose-draft-store.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch agent messages via React Query, kept fresh by WS events.
 * WS `agent_message` events append to the cache directly.
 * Uses staleTime: Infinity - no background refetch needed, except after a branch, whose fork
 * replaces the transcript rather than extending it.
 *
 * @param agentId - The agent whose messages to fetch
 */
export function useAgentMessagesQuery(agentId: string) {
  const queryClient = useQueryClient();
  const { consumeBranchInFlight } = useBranchInFlight(agentId);

  const query = useQuery<AgentMessage[], ApiError>({
    queryKey: agentKeys.messages(agentId),
    queryFn: async () => {
      const response = await apiClient.get<AgentMessage[]>(`/agents/${agentId}/messages`);
      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useWsSubscription(agentId, (message) => {
    if (message.type !== SERVER_MESSAGE_TYPE.AGENT_MESSAGE) {
      return;
    }

    // An agent runs one turn at a time and only branches while idle, so the first agent_message
    // after a branch is that branch's own user message, broadcast once the fork resolved and the
    // session id repointed. The refetch already contains it, so it is not merged here.
    if (consumeBranchInFlight()) {
      void queryClient.invalidateQueries({ queryKey: agentKeys.messages(agentId) });
      return;
    }

    const incoming = message.message;
    queryClient.setQueryData<AgentMessage[]>(agentKeys.messages(agentId), (prev) => {
      const existing = prev ?? [];
      if (existing.some((msg) => msg.id === incoming.id)) {
        return existing;
      }

      return [...existing, incoming];
    });
  });

  return query;
}
