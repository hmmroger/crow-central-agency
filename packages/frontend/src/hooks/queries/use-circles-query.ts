import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCreatedWsMessageSchema,
  CircleUpdatedWsMessageSchema,
  CircleDeletedWsMessageSchema,
  type AgentCircle,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { circleKeys } from "../../services/query-keys.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch circle list via React Query, kept fresh by WS events.
 * Uses staleTime: Infinity because WS events update the cache directly.
 */
export function useCirclesQuery() {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<AgentCircle[], ApiError>({
    queryKey: circleKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgentCircle[]>("/circles");
      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const unregister = onMessage((raw) => {
      const created = CircleCreatedWsMessageSchema.safeParse(raw);
      if (created.success) {
        queryClient.setQueryData<AgentCircle[]>(circleKeys.list(), (prev) => {
          if (!prev) {
            return [created.data.circle];
          }

          if (prev.some((circle) => circle.id === created.data.circle.id)) {
            return prev;
          }

          return [...prev, created.data.circle];
        });

        return;
      }

      const updated = CircleUpdatedWsMessageSchema.safeParse(raw);
      if (updated.success) {
        queryClient.setQueryData<AgentCircle[]>(circleKeys.list(), (prev) => {
          if (!prev) {
            return [updated.data.circle];
          }

          const index = prev.findIndex((circle) => circle.id === updated.data.circle.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = updated.data.circle;

            return next;
          }

          return [...prev, updated.data.circle];
        });

        return;
      }

      const deleted = CircleDeletedWsMessageSchema.safeParse(raw);
      if (deleted.success) {
        queryClient.setQueryData<AgentCircle[]>(circleKeys.list(), (prev) => {
          if (!prev) {
            return [];
          }

          return prev.filter((circle) => circle.id !== deleted.data.circleId);
        });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  return query;
}
