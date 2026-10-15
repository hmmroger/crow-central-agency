import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  type Relationship,
  type RelationshipQuery,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { relationshipKeys } from "../../services/query-keys.js";
import { WS_STATE } from "../../services/ws-client.types.js";
import { applyRelationshipsChanged, toRelationshipQueryString } from "../../utils/relationship-utils.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Circle memberships, for views that group agents by circle */
export const MEMBERSHIP_RELATIONSHIP_QUERY: RelationshipQuery = { relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP };

/**
 * Fetch the relationships matching a filter via React Query, keyed by the filter.
 * RELATIONSHIPS_CHANGED patches the cache in place of a refetch, and a WS
 * reconnect reloads it. The filter must be a stable reference.
 */
export function useRelationshipsQuery(filter: RelationshipQuery) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();

  const query = useQuery<Relationship[], ApiError>({
    queryKey: relationshipKeys.list(filter),
    queryFn: async () => {
      const queryString = toRelationshipQueryString(filter);
      const response = await apiClient.get<Relationship[]>(
        queryString ? `/relationships?${queryString}` : "/relationships"
      );

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.RELATIONSHIPS_CHANGED) {
        queryClient.setQueryData<Relationship[]>(relationshipKeys.list(filter), (previous) =>
          previous ? applyRelationshipsChanged(previous, message, filter) : previous
        );
      }
    });

    return unregister;
  }, [onMessage, queryClient, filter]);

  // Events sent while disconnected are lost, so the list is reloaded.
  const previousStateRef = useRef(connectionState);
  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = connectionState;

    if (
      connectionState === WS_STATE.CONNECTED &&
      (previousState === WS_STATE.RECONNECTING || previousState === WS_STATE.DISCONNECTED)
    ) {
      void queryClient.invalidateQueries({ queryKey: relationshipKeys.list(filter) });
    }
  }, [connectionState, queryClient, filter]);

  return query;
}
