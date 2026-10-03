import { queryOptions } from "@tanstack/react-query";
import type { SuggestWikilinksQuery, WikilinkSuggestion } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** The notes `[[` or `![[` offers for what has been typed so far. */
export function wikilinkSuggestQueryOptions({ query, isEmbed, excludeId }: SuggestWikilinksQuery) {
  return queryOptions<WikilinkSuggestion[], ApiError>({
    queryKey: noteKeys.suggest(query, isEmbed, excludeId),
    queryFn: async () => {
      const params = new URLSearchParams({ query, isEmbed: String(isEmbed) });

      if (excludeId !== undefined) {
        params.set("excludeId", excludeId);
      }

      return unwrapResponse(await apiClient.get<WikilinkSuggestion[]>(`/notes/suggest?${params.toString()}`));
    },
  });
}
