import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentActivityWsMessageSchema, type AgentActivity } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useWsSubscription } from "../use-ws-subscription.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch persisted agent activities via REST, kept fresh by WS `agent_activity` events.
 * Each incoming activity is appended to the cached array (de-duped by id).
 */
export function useAgentActivitiesQuery(agentId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<AgentActivity[], ApiError>({
    queryKey: agentKeys.activities(agentId),
    queryFn: async () => {
      const response = await apiClient.get<AgentActivity[]>(`/agents/${agentId}/activities`);
      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useWsSubscription(agentId, (data) => {
    const activityParsed = AgentActivityWsMessageSchema.safeParse(data);
    if (!activityParsed.success) {
      return;
    }

    const incoming = activityParsed.data.agentActivity;
    queryClient.setQueryData<AgentActivity[]>(agentKeys.activities(agentId), (prev) => {
      const existing = prev ?? [];
      if (existing.some((activity) => activity.id === incoming.id)) {
        return existing;
      }

      return [...existing, incoming];
    });
  });

  return query;
}
