import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RelationshipCreatedWsMessageSchema,
  RelationshipDeletedWsMessageSchema,
  type CircleMember,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { circleKeys } from "../../services/query-keys.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch members of a specific circle via React Query, kept fresh by WS events.
 * Invalidates on relationship changes since membership may have changed.
 */
export function useCircleMembersQuery(circleId: string, enabled = true) {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<CircleMember[], ApiError>({
    queryKey: circleKeys.members(circleId),
    queryFn: async () => {
      const response = await apiClient.get<CircleMember[]>(`/circles/${circleId}/members`);

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
    enabled,
  });

  useEffect(() => {
    const unregister = onMessage((raw) => {
      const isRelevant =
        RelationshipCreatedWsMessageSchema.safeParse(raw).success ||
        RelationshipDeletedWsMessageSchema.safeParse(raw).success;

      if (isRelevant) {
        void queryClient.invalidateQueries({ queryKey: circleKeys.members(circleId) });
      }
    });

    return unregister;
  }, [onMessage, queryClient, circleId]);

  return query;
}
