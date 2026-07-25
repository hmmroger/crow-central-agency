import { z } from "zod";

/** The Claude SDK tool name whose `canUseTool` call parks for a user answer. */
export const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";

/**
 * A single selectable option within a question. `preview` is a sanitized HTML fragment, present only
 * because the query sets `previewFormat: "html"`; options may omit it.
 */
export const AskUserQuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  preview: z.string().optional(),
});

/** One question in an AskUserQuestion set, with its options and select mode. */
export const AskUserQuestionItemSchema = z.object({
  question: z.string(),
  header: z.string(),
  multiSelect: z.boolean(),
  options: z.array(AskUserQuestionOptionSchema),
  allowFreeformResponse: z.boolean().optional(),
});

/** The validated `canUseTool` input for the AskUserQuestion tool (SDK input is advisory; we parse it). */
export const AskUserQuestionSchema = z.object({
  questions: z.array(AskUserQuestionItemSchema),
});

/**
 * Pending question metadata persisted on runtime state so the frontend recovers it on refresh.
 * Single slot — the paused query allows at most one in-flight question per agent.
 */
export const PendingQuestionInfoSchema = z.object({
  toolUseId: z.string(),
  questions: z.array(AskUserQuestionItemSchema),
});

/** How a parked question is resolved: per-question selections, or a freeform reply. */
export const QUESTION_SUBMISSION_KIND = {
  ANSWERS: "answers",
  RESPONSE: "response",
} as const;

export type QuestionSubmissionKind = (typeof QUESTION_SUBMISSION_KIND)[keyof typeof QUESTION_SUBMISSION_KIND];

/**
 * A single answer keyed by question index (question text is a fragile wire key; the backend owns the
 * text mapping). `value` is one label for single-select/free-text, or many for multi-select.
 */
export const QuestionAnswerSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  value: z.union([z.string(), z.array(z.string())]),
});

/** Per-question answers submission — the index-keyed selections the user made. */
export const QuestionAnswersSubmissionSchema = z.object({
  toolUseId: z.string(),
  kind: z.literal(QUESTION_SUBMISSION_KIND.ANSWERS),
  answers: z.array(QuestionAnswerSchema),
});

/** Freeform response submission — dismiss / general reply, valid regardless of per-question completeness. */
export const QuestionResponseSubmissionSchema = z.object({
  toolUseId: z.string(),
  kind: z.literal(QUESTION_SUBMISSION_KIND.RESPONSE),
  response: z.string(),
});

/** UI -> backend submission resolving a parked question. */
export const QuestionSubmissionSchema = z.discriminatedUnion("kind", [
  QuestionAnswersSubmissionSchema,
  QuestionResponseSubmissionSchema,
]);

/**
 * Resolved `updatedInput` returned to the SDK for a per-question answers submission. `answers` is
 * text-keyed (`questions[i].question` -> value), the shape the tool expects.
 */
export const AskUserQuestionAnswersInputSchema = z.object({
  questions: z.array(AskUserQuestionItemSchema),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

/** Resolved `updatedInput` returned to the SDK for a freeform response submission. */
export const AskUserQuestionResponseInputSchema = z.object({
  questions: z.array(AskUserQuestionItemSchema),
  response: z.string(),
});

/** The backend-assembled `updatedInput` handed back to the paused SDK query. */
export const AskUserQuestionResolvedInputSchema = z.union([
  AskUserQuestionAnswersInputSchema,
  AskUserQuestionResponseInputSchema,
]);

export type AskUserQuestionOption = z.infer<typeof AskUserQuestionOptionSchema>;
export type AskUserQuestionItem = z.infer<typeof AskUserQuestionItemSchema>;
export type AskUserQuestion = z.infer<typeof AskUserQuestionSchema>;
export type PendingQuestionInfo = z.infer<typeof PendingQuestionInfoSchema>;
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;
export type QuestionAnswersSubmission = z.infer<typeof QuestionAnswersSubmissionSchema>;
export type QuestionResponseSubmission = z.infer<typeof QuestionResponseSubmissionSchema>;
export type QuestionSubmission = z.infer<typeof QuestionSubmissionSchema>;
export type AskUserQuestionAnswersInput = z.infer<typeof AskUserQuestionAnswersInputSchema>;
export type AskUserQuestionResponseInput = z.infer<typeof AskUserQuestionResponseInputSchema>;
export type AskUserQuestionResolvedInput = z.infer<typeof AskUserQuestionResolvedInputSchema>;
