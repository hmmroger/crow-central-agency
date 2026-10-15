import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type Relationship } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { relationshipKeys } from "../../services/query-keys.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch relationship list via React Query, kept fresh by WS events.
 * Uses staleTime: Infinity because WS events update the cache directly.
 */
export function useRelationshipsQuery() {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<Relationship[], ApiError>({
    queryKey: relationshipKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<Relationship[]>("/relationships");
      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type !== SERVER_MESSAGE_TYPE.RELATIONSHIPS_CHANGED) {
        return;
      }

      const changedIds = new Set(message.deletedIds.concat(message.upserted.map((relationship) => relationship.id)));
      queryClient.setQueryData<Relationship[]>(relationshipKeys.list(), (previous) =>
        previous
          ? previous.filter((relationship) => !changedIds.has(relationship.id)).concat(message.upserted)
          : previous
      );
    });

    return unregister;
  }, [onMessage, queryClient]);

  return query;
}
