import { useQueryClient, useQuery } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type SessionForkPoints } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useWsSubscription } from "../use-ws-subscription.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch a session's fork points, resolved by the backend.
 * Always stale: the event only invalidates the session on screen, so a cached session must refetch when
 * it is returned to, and a fork made with the panel closed changes the result with nobody listening.
 *
 * @param agentId - The agent owning the session
 * @param sessionId - The session whose fork points to fetch; nothing is fetched without one
 */
export function useSessionForkPointsQuery(agentId: string, sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = agentKeys.forkPoints(agentId, sessionId);

  const query = useQuery<SessionForkPoints, ApiError>({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.get<SessionForkPoints>(`/agents/${agentId}/sessions/${sessionId}/fork-points`);
      return unwrapResponse(response);
    },
    staleTime: 0,
    enabled: sessionId !== undefined,
  });

  useWsSubscription(agentId, (message) => {
    if (message.type === SERVER_MESSAGE_TYPE.AGENT_SESSIONS_UPDATED) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });

  return query;
}
