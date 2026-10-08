import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { DataSourceType, DocumentSearchHit } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { searchKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Ranked workspace search hits for `query`, narrowed to `sources`. Idle while the
 * query is blank; the previous hits stay in `data` while the next query loads.
 */
export function useSearchQuery(query: string, sources: readonly DataSourceType[]) {
  return useQuery<DocumentSearchHit[], ApiError>({
    queryKey: searchKeys.results(query, sources),
    queryFn: async () => {
      const params = new URLSearchParams({ query });
      for (const source of sources) {
        params.append("sources", source);
      }

      return unwrapResponse(await apiClient.get<DocumentSearchHit[]>(`/search?${params.toString()}`));
    },
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
}
