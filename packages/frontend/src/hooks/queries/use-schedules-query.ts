import { useQuery } from "@tanstack/react-query";
import type { Schedule } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { scheduleKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch schedules via React Query.
 * No WebSocket integration — schedules only change from the Schedules UI,
 * so invalidation on mutation success is sufficient.
 */
export function useSchedulesQuery(options?: { enabled?: boolean }) {
  return useQuery<Schedule[], ApiError>({
    queryKey: scheduleKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<Schedule[]>("/schedules");
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
    enabled: options?.enabled ?? true,
  });
}
