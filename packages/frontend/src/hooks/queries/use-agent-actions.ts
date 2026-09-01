import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CLIENT_MESSAGE_TYPE,
  PERMISSION_DECISION,
  QUESTION_SUBMISSION_KIND,
  SERVER_MESSAGE_TYPE,
  type BranchPoint,
  type QuestionAnswer,
} from "@crow-central-agency/shared";
import { useWs } from "../use-ws.js";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { agentKeys } from "../../services/query-keys.js";
import { useAgentStatesContext } from "../../providers/agent-states-provider.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Return type of useAgentActions */
export interface AgentActions {
  /**
   * Send a user message - backend creates the AgentMessage and broadcasts via WS.
   * With a `branchPoint` the backend forks that session at the anchor and the message continues
   * the fork instead of the active session.
   */
  sendMessage: (text: string, branchPoint?: BranchPoint) => void;
  /** Inject a btw message while streaming */
  injectMessage: (text: string) => void;
  /** Stop the agent */
  abort: () => void;
  /** Allow a pending permission request */
  allowPermission: (toolUseId: string) => void;
  /** Allow a pending permission request and remember the tool in the agent's auto-approved list */
  allowAlwaysPermission: (toolUseId: string, rules?: string[]) => void;
  /** Deny a pending permission request (optionally with a text message for the agent) */
  denyPermission: (toolUseId: string, message?: string) => void;
  /** Submit per-question answers for a parked AskUserQuestion */
  submitQuestionAnswers: (toolUseId: string, answers: QuestionAnswer[]) => void;
  /** Dismiss a parked AskUserQuestion with a freeform response */
  dismissQuestion: (toolUseId: string, response: string) => void;
}

export function useAgentActions(agentId: string): AgentActions {
  const { send, onMessage } = useWs();
  const queryClient = useQueryClient();
  const { appendInputHistory } = useAgentStatesContext();

  const sendMessage = useCallback(
    (text: string, branchPoint?: BranchPoint) => {
      send({ type: CLIENT_MESSAGE_TYPE.SEND_MESSAGE, agentId, message: text, branchPoint });
      appendInputHistory(agentId, text);

      if (!branchPoint) {
        return;
      }

      // send_message is unacknowledged and the fork behind it is asynchronous, so the truncated
      // transcript only becomes readable once the agent emits the branch's own message — it runs
      // one turn at a time and branches only while idle, so that is necessarily the next one. A
      // rejected branch emits an error instead and never a message, so it closes the listener.
      const unregister = onMessage((message) => {
        if (message.type === SERVER_MESSAGE_TYPE.AGENT_MESSAGE && message.agentId === agentId) {
          unregister();
          void queryClient.invalidateQueries({ queryKey: agentKeys.messages(agentId) });
          return;
        }

        if (message.type === SERVER_MESSAGE_TYPE.ERROR && message.agentId === agentId) {
          unregister();
        }
      });
    },
    [send, onMessage, agentId, appendInputHistory, queryClient]
  );

  const injectMessage = useCallback(
    (text: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.INJECT_MESSAGE, agentId, message: text });
    },
    [send, agentId]
  );

  const abortMutation = useMutation<void, ApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<void>(`/agents/${agentId}/stop`);
      return unwrapResponse(response);
    },
    onError: (error) => {
      console.error(`[abort] failed for agent ${agentId}:`, error.message);
    },
  });

  const allowPermission = useCallback(
    (toolUseId: string) => {
      send({ type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE, agentId, toolUseId, decision: PERMISSION_DECISION.ALLOW });
    },
    [send, agentId]
  );

  const allowAlwaysPermission = useCallback(
    (toolUseId: string, rules?: string[]) => {
      send({
        type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE,
        agentId,
        toolUseId,
        decision: PERMISSION_DECISION.ALLOW_ALWAYS,
        rules,
      });
    },
    [send, agentId]
  );

  const denyPermission = useCallback(
    (toolUseId: string, message?: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.PERMISSION_RESPONSE,
        agentId,
        toolUseId,
        decision: PERMISSION_DECISION.DENY,
        message,
      });
    },
    [send, agentId]
  );

  const submitQuestionAnswers = useCallback(
    (toolUseId: string, answers: QuestionAnswer[]) => {
      send({
        type: CLIENT_MESSAGE_TYPE.RESOLVE_QUESTION,
        toolUseId,
        kind: QUESTION_SUBMISSION_KIND.ANSWERS,
        answers,
      });
    },
    [send]
  );

  const dismissQuestion = useCallback(
    (toolUseId: string, response: string) => {
      send({
        type: CLIENT_MESSAGE_TYPE.RESOLVE_QUESTION,
        toolUseId,
        kind: QUESTION_SUBMISSION_KIND.RESPONSE,
        response,
      });
    },
    [send]
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
