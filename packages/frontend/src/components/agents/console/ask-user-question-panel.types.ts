/** Per-question answer draft: selected option labels and the free-text "Other" entry, tracked separately. */
export interface QuestionDraftValue {
  labels: string[];
  freeText: string;
}

/** The panel's answer draft, keyed by question index. */
export type AnswerDraft = Record<number, QuestionDraftValue>;
