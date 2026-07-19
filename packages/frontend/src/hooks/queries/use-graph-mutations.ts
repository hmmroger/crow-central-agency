import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GraphData, GraphNodePosition } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { graphKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Persist node layout positions and mirror the confirmed write into the graph
 * query cache. The cache is `staleTime: Infinity` + `refetchOnMount: "always"`
 * and the graphology graph is rebuilt from it on every mount; without this
 * patch a remount before the background refetch lands would rebuild from stale
 * coordinates and re-run layout on the just-dragged node. We know the exact
 * saved values, so we `setQueryData` rather than invalidate (no refetch needed).
 */
export function useSaveGraphPositions() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, GraphNodePosition[]>({
    mutationFn: async (positions) => {
      const response = await apiClient.patch<void>("/graph/positions", { positions });

      return unwrapResponse(response);
    },
    onSuccess: (_data, positions) => {
      const savedById = new Map(positions.map((position) => [position.id, position]));
      queryClient.setQueryData<GraphData>(graphKeys.data(), (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          nodes: current.nodes.map((node) => {
            const saved = savedById.get(node.id);

            return saved ? { ...node, x: saved.x, y: saved.y } : node;
          }),
        };
      });
    },
  });
}

/**
 * Clear all saved node layout positions. Callers invalidate the graph query and
 * re-run layout on success (see GraphCanvas).
 */
export function useClearGraphPositions() {
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      const response = await apiClient.del<void>("/graph/positions");

      return unwrapResponse(response);
    },
  });
}
