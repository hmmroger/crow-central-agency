import type { AskUserQuestionItem, AskUserQuestionResolvedInput } from "@crow-central-agency/shared";

/** A parked AskUserQuestion awaiting the user's answer. */
export interface PendingQuestion {
  agentId: string;
  questions: AskUserQuestionItem[];
  resolve: (updatedInput: AskUserQuestionResolvedInput) => void;
}
