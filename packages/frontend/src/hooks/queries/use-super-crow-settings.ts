import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SuperCrowSettings, UpdateSuperCrowSettingsInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { systemSettingsKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

const SUPER_CROW_ENDPOINT = "/system-settings/super-crow";

/** Fetch Super Crow settings via React Query. */
export function useSuperCrowSettingsQuery() {
  return useQuery<SuperCrowSettings, ApiError>({
    queryKey: systemSettingsKeys.superCrow(),
    queryFn: async () => {
      const response = await apiClient.get<SuperCrowSettings>(SUPER_CROW_ENDPOINT);
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}

/**
 * Patch Super Crow settings. Optimistically updates the cache on mutate so
 * per-row toggles in the settings feed table feel instant; rolls back on
 * error and reconciles on success with the server response.
 */
export function useUpdateSuperCrowSettings() {
  const queryClient = useQueryClient();

  return useMutation<
    SuperCrowSettings,
    ApiError,
    UpdateSuperCrowSettingsInput,
    { previous: SuperCrowSettings | undefined }
  >({
    mutationFn: async (input) => {
      const response = await apiClient.patch<SuperCrowSettings>(SUPER_CROW_ENDPOINT, input);
      return unwrapResponse(response);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: systemSettingsKeys.superCrow() });
      const previous = queryClient.getQueryData<SuperCrowSettings>(systemSettingsKeys.superCrow());
      const base: SuperCrowSettings = previous ?? { configuredFeeds: [] };
      queryClient.setQueryData<SuperCrowSettings>(systemSettingsKeys.superCrow(), { ...base, ...input });
      return { previous };
    },
    onError: (_error, _input, context) => {
      // Roll back even when previous was undefined (cache miss before the
      // optimistic write); setting undefined forces a refetch to reconcile.
      if (context !== undefined) {
        queryClient.setQueryData(systemSettingsKeys.superCrow(), context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(systemSettingsKeys.superCrow(), data);
    },
  });
}
