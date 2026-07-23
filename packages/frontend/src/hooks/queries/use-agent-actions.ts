import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CLIENT_MESSAGE_TYPE,
  MAX_INPUT_HISTORY,
  PERMISSION_DECISION,
  QUESTION_SUBMISSION_KIND,
  type AgentRuntimeState,
  type QuestionAnswer,
} from "@crow-central-agency/shared";
import { useWs } from "../use-ws.js";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Return type of useAgentActions */
export interface AgentActions {
  /** Send a user message - backend creates the AgentMessage and broadcasts via WS */
  sendMessage: (text: string) => void;
  /** Inject a btw message while streaming */
  injectMessage: (text: string) => void;
  /** Stop the agent */
  abort: () => void;
  /** Allow a pending permission request */
  allowPermission: (toolUseId: string) => void;
  /** Allow a pending permission request and remember the tool in the agent's auto-approved list */
  allowAlwaysPermission: (toolUseId: string) => void;
  /** Deny a pending permission request (optionally with a text message for the agent) */
  denyPermission: (toolUseId: string, message?: string) => void;
  /** Submit per-question answers for a parked AskUserQuestion */
  submitQuestionAnswers: (toolUseId: string, answers: QuestionAnswer[]) => void;
  /** Dismiss a parked AskUserQuestion with a freeform response */
  dismissQuestion: (toolUseId: string, response: string) => void;
}

/**
 * Action callbacks for agent interaction.
 * WS sends for real-time commands, useMutation for REST lifecycle operations.
 *
 * @param agentId - The agent to act on
 */
export function useAgentActions(agentId: string): AgentActions {
  const { send } = useWs();
  const queryClient = useQueryClient();

  // Optimistic update (mirrors the backend dedupe + cap) so the just-sent message is
  // recallable until the next mount refetch reconciles inputHistory from /state.
  const appendInputHistory = useCallback(
    (text: string) => {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev) {
          return prev;
        }

        const history = prev.inputHistory ?? [];
        if (history[history.length - 1] === text) {
          return prev;
        }

        return { ...prev, inputHistory: [...history, text].slice(-MAX_INPUT_HISTORY) };
      });
    },
    [queryClient, agentId]
  );

  /** Send a user message - backend creates the AgentMessage and broadcasts agent_message WS */
  const sendMessage = useCallback(
    (text: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.SEND_MESSAGE, agentId, message: text });
      appendInputHistory(text);
    },
    [send, agentId, appendInputHistory]
  );

  /** Inject a btw message while streaming */
  const injectMessage = useCallback(
    (text: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.INJECT_MESSAGE, agentId, message: text });
    },
    [send, agentId]
  );

  /** Stop the agent */
  const abortMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/stop`);
      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[abort] failed for agent ${agentId}:`, error.message);
    },
  });

  /** Optimistically remove a pending permission from the query cache */
  const removePendingPermission = useCallback(
    (toolUseId: string) => {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          pendingPermissions: prev.pendingPermissions?.filter((perm) => perm.toolUseId !== toolUseId),
        };
      });
    },
    [queryClient, agentId]
  );

  /** Allow a pending permission request */
  const allowPermission = useCallback(
    (toolUseId: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE, agentId, toolUseId, decision: PERMISSION_DECISION.ALLOW });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  /** Allow a pending permission request and remember the tool in the agent's auto-approved list */
  const allowAlwaysPermission = useCallback(
    (toolUseId: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE,
        agentId,
        toolUseId,
        decision: PERMISSION_DECISION.ALLOW_ALWAYS,
      });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  /** Deny a pending permission request (optionally with a text message for the agent) */
  const denyPermission = useCallback(
    (toolUseId: string, message?: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE,
        agentId,
        toolUseId,
        decision: PERMISSION_DECISION.DENY,
        message,
      });
      removePendingPermission(toolUseId);
    },
    [send, agentId, removePendingPermission]
  );

  /** Optimistically clear the pending question from the query cache */
  const clearPendingQuestion = useCallback(
    (toolUseId: string) => {
      queryClient.setQueryData<AgentRuntimeState>(agentKeys.state(agentId), (prev) => {
        if (!prev || prev.pendingQuestion?.toolUseId !== toolUseId) {
          return prev;
        }

        return { ...prev, pendingQuestion: undefined };
      });
    },
    [queryClient, agentId]
  );

  /** Submit per-question answers for a parked AskUserQuestion */
  const submitQuestionAnswers = useCallback(
    (toolUseId: string, answers: QuestionAnswer[]) => {
      send({
        type: CLIENT_MESSAGE_TYPE.RESOLVE_QUESTION,
        toolUseId,
        kind: QUESTION_SUBMISSION_KIND.ANSWERS,
        answers,
      });
      clearPendingQuestion(toolUseId);
    },
    [send, clearPendingQuestion]
  );

  /** Dismiss a parked AskUserQuestion with a freeform response */
  const dismissQuestion = useCallback(
    (toolUseId: string, response: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.RESOLVE_QUESTION,
        toolUseId,
        kind: QUESTION_SUBMISSION_KIND.RESPONSE,
        response,
      });
      clearPendingQuestion(toolUseId);
    },
    [send, clearPendingQuestion]
  );

  const { mutate: abortMutate } = abortMutation;

  const abort = useCallback(() => abortMutate(), [abortMutate]);

  return {
    sendMessage,
    injectMessage,
    abort,
    allowPermission,
    allowAlwaysPermission,
    denyPermission,
    submitQuestionAnswers,
    dismissQuestion,
  };
}
