import { useQuery } from "@tanstack/react-query";
import type { FeedInfo } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { feedKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch configured feeds via React Query.
 * Feeds only change from the Settings UI, so simple invalidation on mutation success is sufficient.
 */
export function useFeedsQuery() {
  return useQuery<FeedInfo[], ApiError>({
    queryKey: feedKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<FeedInfo[]>("/feeds");
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}
