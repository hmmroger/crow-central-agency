import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AGENT_STATUS,
  AgentStatusWsMessageSchema,
  AgentUsageWsMessageSchema,
  PermissionRequestWsMessageSchema,
  PermissionCancelledWsMessageSchema,
  type AgentRuntimeState,
  type SessionUsage,
  type PendingPermissionInfo,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import { useWsSubscription } from "./use-ws-subscription.js";
import type { ApiError } from "../services/api-client.types.js";

/** Default session usage — zero values for all fields */
export const DEFAULT_SESSION_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  contextUsed: 0,
  contextTotal: 0,
};

/** Default state when no backend state exists yet */
const DEFAULT_STATE: AgentRuntimeState = {
  agentId: "",
  status: AGENT_STATUS.IDLE,
  sessionUsage: DEFAULT_SESSION_USAGE,
};

/**
 * Fetch agent runtime state via React Query, kept fresh by WS events.
 * WS `agent_status` and `agent_usage` events update the cache directly.
 * Uses staleTime: Infinity — no background refetch needed.
 *
 * @param agentId - The agent whose state to fetch
 */
export function useAgentStateQuery(agentId: string) {
  const queryClient = useQueryClient();

  const query = useQuery<AgentRuntimeState, ApiError>({
    queryKey: agentKeys.state(agentId),
    queryFn: async () => {
      const response = await apiClient.get<AgentRuntimeState>(`/agents/${agentId}/state`);

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useWsSubscription(agentId, (data) => {
    const statusParsed = AgentStatusWsMessageSchema.safeParse(data);

    if (statusParsed.success) {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => ({
        ...(prev ?? { ...DEFAULT_STATE, agentId }),
        status: statusParsed.data.status,
      }));
      void queryClient.invalidateQueries({ queryKey: agentKeys.messages(agentId) });
      return;
    }

    const usageParsed = AgentUsageWsMessageSchema.safeParse(data);

    if (usageParsed.success) {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => ({
        ...(prev ?? { ...DEFAULT_STATE, agentId }),
        sessionUsage: {
          inputTokens: usageParsed.data.inputTokens,
          outputTokens: usageParsed.data.outputTokens,
          totalCostUsd: usageParsed.data.totalCostUsd,
          contextUsed: usageParsed.data.contextUsed,
          contextTotal: usageParsed.data.contextTotal,
        },
      }));

      return;
    }

    const permRequestParsed = PermissionRequestWsMessageSchema.safeParse(data);

    if (permRequestParsed.success) {
      const permInfo: PendingPermissionInfo = {
        toolUseId: permRequestParsed.data.toolUseId,
        toolName: permRequestParsed.data.toolName,
        input: permRequestParsed.data.input,
        decisionReason: permRequestParsed.data.decisionReason,
      };

      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        const base = prev ?? { ...DEFAULT_STATE, agentId };
        return {
          ...base,
          pendingPermissions: [...(base.pendingPermissions ?? []), permInfo],
        };
      });

      return;
    }

    const permCancelledParsed = PermissionCancelledWsMessageSchema.safeParse(data);

    if (permCancelledParsed.success) {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev) {
          return { ...DEFAULT_STATE, agentId };
        }

        return {
          ...prev,
          pendingPermissions: prev.pendingPermissions?.filter(
            (perm) => perm.toolUseId !== permCancelledParsed.data.toolUseId
          ),
        };
      });
    }
  });

  return query;
}
