import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CLIENT_MESSAGE_TYPE,
  PERMISSION_DECISION,
  QUESTION_SUBMISSION_KIND,
  type BranchPoint,
  type QuestionAnswer,
} from "@crow-central-agency/shared";
import { useWs } from "../use-ws.js";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { useAgentStatesContext } from "../../providers/agent-states-provider.js";
import { useBranchInFlight } from "../../stores/compose-draft-store.js";
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
  const { send } = useWs();
  const { appendInputHistory } = useAgentStatesContext();
  const { markBranchInFlight } = useBranchInFlight(agentId);

  const sendMessage = useCallback(
    (text: string, branchPoint?: BranchPoint) => {
      send({ type: CLIENT_MESSAGE_TYPE.SEND_MESSAGE, agentId, message: text, branchPoint });
      appendInputHistory(agentId, text);

      // The fork the backend runs for a branch is asynchronous and unacknowledged, so refetching
      // here would race it. useAgentMessagesQuery refetches once the fork is observably durable.
      if (branchPoint) {
        markBranchInFlight();
      }
    },
    [send, agentId, appendInputHistory, markBranchInFlight]
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
