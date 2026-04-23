import { useQuery } from "@tanstack/react-query";
import type { SensorInfo } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { sensorKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch available sensors from the backend.
 * Sensors are registered at startup and don't change at runtime.
 */
export function useSensorsQuery() {
  return useQuery<SensorInfo[], ApiError>({
    queryKey: sensorKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<SensorInfo[]>("/sensors");
      return unwrapResponse(response);
    },
    staleTime: Infinity,
  });
}
