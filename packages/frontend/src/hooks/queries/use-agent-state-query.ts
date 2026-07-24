import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  AGENT_STATUS,
  SERVER_MESSAGE_TYPE,
  type AgentRuntimeState,
  type SessionUsage,
  type PendingPermissionInfo,
  type PendingQuestionInfo,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useWsSubscription } from "../use-ws-subscription.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Default session usage - zero values for all fields */
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
  activeDomainFragmentIds: [],
  sessionUsage: DEFAULT_SESSION_USAGE,
};

/**
 * Fetch agent runtime state via React Query, kept fresh by WS events.
 * WS `agent_status` and `agent_usage` events update the cache directly.
 * Uses staleTime: Infinity - no background refetch needed.
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

  useWsSubscription(agentId, (message) => {
    if (message.type === SERVER_MESSAGE_TYPE.AGENT_STATUS) {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => ({
        ...(prev ?? { ...DEFAULT_STATE, agentId }),
        status: message.status,
        messageSource: message.messageSource ?? undefined,
      }));
      void queryClient.invalidateQueries({ queryKey: agentKeys.messages(agentId) });

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.AGENT_USAGE) {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => ({
        ...(prev ?? { ...DEFAULT_STATE, agentId }),
        sessionUsage: {
          inputTokens: message.inputTokens,
          outputTokens: message.outputTokens,
          totalCostUsd: message.totalCostUsd,
          contextUsed: message.contextUsed,
          contextTotal: message.contextTotal,
        },
      }));

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.PERMISSION_REQUEST) {
      const permInfo: PendingPermissionInfo = {
        toolUseId: message.toolUseId,
        toolName: message.toolName,
        input: message.input,
        autoApproveRules: message.autoApproveRules,
        decisionReason: message.decisionReason,
      };

      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        const base = prev ?? { ...DEFAULT_STATE, agentId };
        const existing = base.pendingPermissions ?? [];

        if (existing.some((perm) => perm.toolUseId === permInfo.toolUseId)) {
          return base;
        }

        return {
          ...base,
          pendingPermissions: [...existing, permInfo],
        };
      });

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.PERMISSION_CANCELLED) {
      const { toolUseId } = message;
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev) {
          return { ...DEFAULT_STATE, agentId };
        }

        return {
          ...prev,
          pendingPermissions: prev.pendingPermissions?.filter((perm) => perm.toolUseId !== toolUseId),
        };
      });

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.QUESTION_REQUEST) {
      const questionInfo: PendingQuestionInfo = {
        toolUseId: message.toolUseId,
        questions: message.questions,
      };

      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => ({
        ...(prev ?? { ...DEFAULT_STATE, agentId }),
        pendingQuestion: questionInfo,
      }));

      return;
    }

    if (message.type === SERVER_MESSAGE_TYPE.QUESTION_RESOLVED) {
      const { toolUseId } = message;
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev || prev.pendingQuestion?.toolUseId !== toolUseId) {
          return prev;
        }

        return { ...prev, pendingQuestion: undefined };
      });
    }
  });

  return query;
}
