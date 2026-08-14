import { useQueryClient, useQuery } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type SessionHistoryNode } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useWsSubscription } from "../use-ws-subscription.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch an agent's sessions, already ordered and depth-annotated by the backend.
 * The event only arrives while mounted, hence the refetch on mount: a turn taken with the panel
 * closed changes the list with nobody listening.
 *
 * @param agentId - The agent whose sessions to fetch
 */
export function useAgentSessionsQuery(agentId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<SessionHistoryNode[], ApiError>({
    queryKey: agentKeys.sessions(agentId),
    queryFn: async () => {
      const response = await apiClient.get<SessionHistoryNode[]>(`/agents/${agentId}/sessions`);
      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useWsSubscription(agentId, (message) => {
    if (message.type === SERVER_MESSAGE_TYPE.AGENT_SESSIONS_UPDATED) {
      void queryClient.invalidateQueries({ queryKey: agentKeys.sessions(agentId) });
    }
  });

  return query;
}
