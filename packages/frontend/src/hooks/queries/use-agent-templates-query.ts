import { useQuery } from "@tanstack/react-query";
import type { AgentConfigTemplate } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentTemplateKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch the list of saved agent config templates.
 */
export function useAgentTemplatesQuery() {
  return useQuery<AgentConfigTemplate[], ApiError>({
    queryKey: agentTemplateKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgentConfigTemplate[]>("/agent-templates");
      return unwrapResponse(response);
    },
  });
}
