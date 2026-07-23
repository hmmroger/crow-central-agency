import {
  QUESTION_SUBMISSION_KIND,
  type AskUserQuestionItem,
  type AskUserQuestionResolvedInput,
  type QuestionSubmission,
} from "@crow-central-agency/shared";
import type { PendingQuestion } from "./question-handler.types.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import { logger } from "../../utils/logger.js";

const log = logger.child({ context: "question-handler" });

/**
 * Manages AskUserQuestion clarification requests. Unlike the permission flow, a parked question arms
 * no timeout — it stays pending until the user answers or the agent stops.
 */
export class QuestionHandler {
  private pending = new Map<string, PendingQuestion>();

  constructor(private readonly broadcaster: WsBroadcaster) {}

  /**
   * Park a question, broadcast a question_request to WS subscribers, and return a promise that
   * resolves once the user submits an answer or the agent is stopped.
   */
  public async requestQuestion(
    agentId: string,
    toolUseId: string,
    questions: AskUserQuestionItem[]
  ): Promise<AskUserQuestionResolvedInput> {
    return new Promise<AskUserQuestionResolvedInput>((resolve) => {
      this.pending.set(toolUseId, { agentId, questions, resolve });

      this.broadcaster.broadcast({
        type: "question_request",
        agentId,
        toolUseId,
        questions,
      });

      log.info({ agentId, toolUseId, count: questions.length }, "Question requested");
    });
  }

  /**
   * Resolve a parked question with the user's submission. Assembles the SDK updatedInput from the
   * stored questions, resolves the parked promise, and broadcasts question_resolved.
   */
  public resolveQuestion(toolUseId: string, submission: QuestionSubmission): void {
    const pendingQuestion = this.pending.get(toolUseId);

    if (!pendingQuestion) {
      log.warn({ toolUseId }, "No pending question found");

      return;
    }

    this.pending.delete(toolUseId);
    pendingQuestion.resolve(this.assembleUpdatedInput(pendingQuestion.questions, submission));

    this.broadcaster.broadcast({
      type: "question_resolved",
      agentId: pendingQuestion.agentId,
      toolUseId,
    });

    log.info({ toolUseId, agentId: pendingQuestion.agentId, kind: submission.kind }, "Question resolved");
  }

  /**
   * Settle and drop all pending questions for an agent (on stop/teardown). The SDK cancels the
   * canUseTool wait on query abort, so the settle value never reaches the model; this prevents a leak.
   */
  public cancelQuestionsForAgent(agentId: string): void {
    for (const [toolUseId, pendingQuestion] of this.pending) {
      if (pendingQuestion.agentId !== agentId) {
        continue;
      }

      this.pending.delete(toolUseId);
      pendingQuestion.resolve({ questions: pendingQuestion.questions, answers: {} });

      this.broadcaster.broadcast({
        type: "question_resolved",
        agentId,
        toolUseId,
      });

      log.info({ toolUseId, agentId }, "Question cancelled");
    }
  }

  /** Build the SDK updatedInput: `response` for a freeform reply, else text-keyed per-question answers. */
  private assembleUpdatedInput(
    questions: AskUserQuestionItem[],
    submission: QuestionSubmission
  ): AskUserQuestionResolvedInput {
    if (submission.kind === QUESTION_SUBMISSION_KIND.RESPONSE) {
      return { questions, response: submission.response };
    }

    const answers: Record<string, string | string[]> = {};
    for (const answer of submission.answers) {
      const question = questions[answer.questionIndex];
      if (question) {
        answers[question.question] = answer.value;
      }
    }

    return { questions, answers };
  }
}
