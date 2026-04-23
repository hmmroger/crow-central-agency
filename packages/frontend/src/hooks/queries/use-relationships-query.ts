import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RelationshipCreatedWsMessageSchema,
  RelationshipDeletedWsMessageSchema,
  type Relationship,
} from "@crow-central-agency/shared";
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
    const unregister = onMessage((raw) => {
      const created = RelationshipCreatedWsMessageSchema.safeParse(raw);
      if (created.success) {
        queryClient.setQueryData<Relationship[]>(relationshipKeys.list(), (prev) => {
          if (!prev) {
            return [created.data.relationship];
          }

          return [...prev, created.data.relationship];
        });

        return;
      }

      const deleted = RelationshipDeletedWsMessageSchema.safeParse(raw);
      if (deleted.success) {
        queryClient.setQueryData<Relationship[]>(relationshipKeys.list(), (prev) => {
          if (!prev) {
            return [];
          }

          return prev.filter((relationship) => relationship.id !== deleted.data.relationshipId);
        });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  return query;
}
