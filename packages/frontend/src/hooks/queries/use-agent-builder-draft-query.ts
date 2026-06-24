import { useQuery } from "@tanstack/react-query";
import type { AgentBuilderDraftResponse, AgentBuilderDraftView } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentBuilderKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch the single active agent-builder draft as a resolved view (ids mapped to friendly names). The
 * endpoint returns {@link AgentBuilderDraftResponse}; `select` maps the absent draft to `undefined`.
 * The board renders `data.agents` directly — no local copy of the fleet is kept.
 */
export function useAgentBuilderDraftQuery() {
  return useQuery<AgentBuilderDraftResponse, ApiError, AgentBuilderDraftView | undefined>({
    queryKey: agentBuilderKeys.draft(),
    queryFn: async () => {
      const response = await apiClient.get<AgentBuilderDraftResponse>("/agent-builder/draft");
      return unwrapResponse(response);
    },
    select: (data) => data.draft ?? undefined,
  });
}
