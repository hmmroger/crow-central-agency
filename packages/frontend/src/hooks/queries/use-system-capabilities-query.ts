import { useQuery } from "@tanstack/react-query";
import type { SystemCapabilities } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { systemKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch backend feature-flag capabilities.
 * Capabilities are env-gated and never change at runtime, so the result
 * is cached indefinitely.
 */
export function useSystemCapabilitiesQuery() {
  return useQuery<SystemCapabilities, ApiError>({
    queryKey: systemKeys.capabilities(),
    queryFn: async () => {
      const response = await apiClient.get<SystemCapabilities>("/system/capabilities");
      return unwrapResponse(response);
    },
    staleTime: Infinity,
  });
}
