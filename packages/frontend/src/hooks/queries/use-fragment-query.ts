import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FragmentUpdatedWsMessageSchema,
  FragmentDeletedWsMessageSchema,
  type Fragment,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { fragmentKeys } from "../../services/query-keys.js";
import { useWs } from "../use-ws.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch a single full fragment via React Query, kept fresh by WS events.
 * Invalidates the detail key when a FragmentUpdated/FragmentDeleted message
 * targets this fragment, so an open viewer stays live if reflection rewrites it.
 */
export function useFragmentQuery(fragmentId: string) {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const query = useQuery<Fragment, ApiError>({
    queryKey: fragmentKeys.detail(fragmentId),
    queryFn: async () => {
      const response = await apiClient.get<Fragment>(`/fragments/${fragmentId}`);

      return unwrapResponse(response);
    },
    enabled: Boolean(fragmentId),
  });

  useEffect(() => {
    const unregister = onMessage((raw) => {
      const updated = FragmentUpdatedWsMessageSchema.safeParse(raw);
      const deleted = FragmentDeletedWsMessageSchema.safeParse(raw);
      const matchesFragment =
        (updated.success && updated.data.fragmentId === fragmentId) ||
        (deleted.success && deleted.data.fragmentId === fragmentId);

      if (matchesFragment) {
        void queryClient.invalidateQueries({ queryKey: fragmentKeys.detail(fragmentId) });
      }
    });

    return unregister;
  }, [onMessage, queryClient, fragmentId]);

  return query;
}
