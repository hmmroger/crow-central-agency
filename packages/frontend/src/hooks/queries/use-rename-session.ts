import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Arguments of a single rename */
export interface RenameSessionInput {
  sessionId: string;
  label: string;
}

/** Return type of useRenameSession */
export interface RenameSession {
  /** Give one of the agent's sessions a new label */
  renameSession: (input: RenameSessionInput) => void;
  error?: ApiError;
  isPending: boolean;
}

/** Nothing is invalidated on success: a rename broadcasts agent_sessions_updated, which the query follows. */
export function useRenameSession(agentId: string): RenameSession {
  const renameSessionMutation = useMutation<void, ApiError, RenameSessionInput>({
    mutationFn: async ({ sessionId, label }: RenameSessionInput) => {
      const response = await apiClient.patch<void>(`/agents/${agentId}/sessions/${encodeURIComponent(sessionId)}`, {
        label,
      });

      return unwrapResponse(response);
    },
  });

  const { mutate: renameSessionMutate, error, isPending } = renameSessionMutation;
  const renameSession = useCallback((input: RenameSessionInput) => renameSessionMutate(input), [renameSessionMutate]);

  return { renameSession, error: error ?? undefined, isPending };
}
