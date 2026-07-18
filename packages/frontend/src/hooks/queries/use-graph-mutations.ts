import { useMutation } from "@tanstack/react-query";
import type { GraphNodePosition } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Persist node layout positions. Layout is per-viewer state, so this does not
 * invalidate the graph query — the local sigma graph already reflects the drag.
 */
export function useSaveGraphPositions() {
  return useMutation<void, ApiError, GraphNodePosition[]>({
    mutationFn: async (positions) => {
      const response = await apiClient.patch<void>("/graph/positions", { positions });

      return unwrapResponse(response);
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
