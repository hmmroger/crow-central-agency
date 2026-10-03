import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ResolveWikilinkBatchInput, WikilinkResolution } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";
import type { WikilinkResolutionMap } from "./use-wikilink-resolve-query.types.js";

/** One batched resolve for `targets`, which callers pass sorted and distinct so equal sets share a cache entry. */
export function wikilinkResolveQueryOptions(targets: string[]) {
  return queryOptions<WikilinkResolutionMap, ApiError>({
    queryKey: noteKeys.resolve(targets),
    queryFn: async () => {
      const input: ResolveWikilinkBatchInput = { targets };
      const resolutions = unwrapResponse(await apiClient.post<WikilinkResolution[]>("/notes/resolve-batch", input));

      return new Map(resolutions.map((resolution) => [resolution.target, resolution.note]));
    },
    enabled: targets.length > 0,
  });
}

/** What each wikilink target names; runs only when there are targets. */
export function useWikilinkResolveQuery(targets: string[]) {
  return useQuery(wikilinkResolveQueryOptions(targets));
}
