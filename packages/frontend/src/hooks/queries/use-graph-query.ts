import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCreatedWsMessageSchema,
  CircleUpdatedWsMessageSchema,
  CircleDeletedWsMessageSchema,
  RelationshipCreatedWsMessageSchema,
  RelationshipDeletedWsMessageSchema,
  AgentCreatedWsMessageSchema,
  AgentUpdatedWsMessageSchema,
  AgentDeletedWsMessageSchema,
  type GraphData,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { graphKeys } from "../../services/query-keys.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch graph data via React Query, kept fresh by WS events.
 * Invalidates and refetches when circles, relationships, or agents change.
 */
export function useGraphQuery() {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<GraphData, ApiError>({
    queryKey: graphKeys.data(),
    queryFn: async () => {
      const response = await apiClient.get<GraphData>("/graph");

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const unregister = onMessage((raw) => {
      const isGraphRelevant =
        CircleCreatedWsMessageSchema.safeParse(raw).success ||
        CircleUpdatedWsMessageSchema.safeParse(raw).success ||
        CircleDeletedWsMessageSchema.safeParse(raw).success ||
        RelationshipCreatedWsMessageSchema.safeParse(raw).success ||
        RelationshipDeletedWsMessageSchema.safeParse(raw).success ||
        AgentCreatedWsMessageSchema.safeParse(raw).success ||
        AgentUpdatedWsMessageSchema.safeParse(raw).success ||
        AgentDeletedWsMessageSchema.safeParse(raw).success;

      if (isGraphRelevant) {
        void queryClient.invalidateQueries({ queryKey: graphKeys.data() });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  return query;
}
