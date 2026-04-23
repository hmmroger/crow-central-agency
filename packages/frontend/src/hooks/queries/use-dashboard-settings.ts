import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardSettings, UpdateDashboardSettingsInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { systemSettingsKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

const DASHBOARD_ENDPOINT = "/system-settings/dashboard";

/** Fetch dashboard settings via React Query. */
export function useDashboardSettingsQuery() {
  return useQuery<DashboardSettings, ApiError>({
    queryKey: systemSettingsKeys.dashboard(),
    queryFn: async () => {
      const response = await apiClient.get<DashboardSettings>(DASHBOARD_ENDPOINT);
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}

/**
 * Patch dashboard settings. Optimistically updates the cache on mutate so
 * drag-and-drop reorders feel instant; rolls back on error and reconciles
 * on success with the server response.
 */
export function useUpdateDashboardSettings() {
  const queryClient = useQueryClient();

  return useMutation<
    DashboardSettings,
    ApiError,
    UpdateDashboardSettingsInput,
    { previous: DashboardSettings | undefined }
  >({
    mutationFn: async (input) => {
      const response = await apiClient.patch<DashboardSettings>(DASHBOARD_ENDPOINT, input);
      return unwrapResponse(response);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: systemSettingsKeys.dashboard() });
      const previous = queryClient.getQueryData<DashboardSettings>(systemSettingsKeys.dashboard());
      const base: DashboardSettings = previous ?? { circleAgentOrder: {}, pinnedAgentOrder: [] };
      // circleAgentOrder is a per-circle map — a partial update carries the
      // entries for one circle at a time, so merge into the existing map
      // instead of replacing it. Without this, unrelated circles would
      // briefly lose their saved order between mutate and success.
      const next: DashboardSettings = {
        ...base,
        circleAgentOrder:
          input.circleAgentOrder === undefined
            ? base.circleAgentOrder
            : { ...base.circleAgentOrder, ...input.circleAgentOrder },
        pinnedAgentOrder: input.pinnedAgentOrder ?? base.pinnedAgentOrder,
      };
      queryClient.setQueryData<DashboardSettings>(systemSettingsKeys.dashboard(), next);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(systemSettingsKeys.dashboard(), context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(systemSettingsKeys.dashboard(), data);
    },
  });
}
