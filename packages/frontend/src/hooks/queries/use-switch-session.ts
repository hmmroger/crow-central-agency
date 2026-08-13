import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Return type of useSwitchSession */
export interface SwitchSession {
  /** Make one of the agent's existing sessions the current one */
  switchSession: (sessionId: string) => void;
  /** The rejection from the last attempt, if it failed */
  error?: ApiError;
  isPending: boolean;
}

/**
 * Switch an agent to an existing session via REST.
 *
 * POSTs /agents/:id/session/switch and invalidates the messages and runtime-state queries, so the
 * console reloads against the now-current session and the current-session marker moves. The sessions
 * query is left alone: a switch changes which session is current, not the ledger.
 *
 * @param agentId - The agent to switch
 */
export function useSwitchSession(agentId: string): SwitchSession {
  const queryClient = useQueryClient();

  const switchSessionMutation = useMutation<void, ApiError, string>({
    mutationFn: async (sessionId: string) => {
      const response = await apiClient.post<void>(`/agents/${agentId}/session/switch`, { sessionId });

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.messages(agentId) });
      void queryClient.invalidateQueries({ queryKey: agentKeys.state(agentId) });
    },
  });

  const { mutate: switchSessionMutate, error, isPending } = switchSessionMutation;
  const switchSession = useCallback((sessionId: string) => switchSessionMutate(sessionId), [switchSessionMutate]);

  return { switchSession, error: error ?? undefined, isPending };
}
