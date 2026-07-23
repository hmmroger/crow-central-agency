import { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AskUserQuestionItem, QuestionAnswer } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn";
import { QuestionStepper } from "./question-stepper.js";
import { QuestionItem } from "./question-item.js";
import type { AnswerDraft, QuestionDraftValue } from "./ask-user-question-panel.types.js";

interface AskUserQuestionPanelProps {
  toolUseId: string;
  questions: AskUserQuestionItem[];
  onSubmit: (toolUseId: string, answers: QuestionAnswer[]) => void;
  onRespond: (toolUseId: string, response: string) => void;
}

const EMPTY_DRAFT_VALUE: QuestionDraftValue = { labels: [], freeText: "" };

/** A draft value counts as answered when it has a selected label or non-empty free-text. */
function isValueAnswered(value: QuestionDraftValue | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  return value.labels.length > 0 || value.freeText.trim().length > 0;
}

/** Flatten a structured draft value to the wire QuestionAnswer value for its select mode. */
function toAnswerValue(value: QuestionDraftValue, multiSelect: boolean): string | string[] {
  const freeText = value.freeText.trim();
  if (!multiSelect) {
    return freeText ? freeText : (value.labels[0] ?? "");
  }

  return [...value.labels, ...(freeText ? [freeText] : [])];
}

/**
 * Inline, paginated AskUserQuestion card — one question per page with free back/forth navigation.
 * Backend is source of truth; this holds only the transient answer draft and the current page.
 * Submit is gated on all questions being answered; Respond sends a freeform reply at any point.
 */
export function AskUserQuestionPanel({ toolUseId, questions, onSubmit, onRespond }: AskUserQuestionPanelProps) {
  const [draft, setDraft] = useState<AnswerDraft>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRespond, setShowRespond] = useState(false);
  const [responseText, setResponseText] = useState("");

  const total = questions.length;
  const currentQuestion = questions[currentIndex];

  const answeredIndices = useMemo(() => {
    const indices = new Set<number>();
    questions.forEach((_question, index) => {
      if (isValueAnswered(draft[index])) {
        indices.add(index);
      }
    });

    return indices;
  }, [questions, draft]);

  const allAnswered = answeredIndices.size === total;

  const handleValueChange = useCallback((index: number, value: QuestionDraftValue) => {
    setDraft((prev) => ({ ...prev, [index]: value }));
  }, []);

  const goToIndex = useCallback(
    (index: number) => {
      setCurrentIndex(Math.min(Math.max(index, 0), total - 1));
    },
    [total]
  );

  const goPrev = useCallback(() => setCurrentIndex((index) => Math.max(index - 1, 0)), []);
  const goNext = useCallback(() => setCurrentIndex((index) => Math.min(index + 1, total - 1)), [total]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      if (event.key === "ArrowLeft") {
        goPrev();
      } else if (event.key === "ArrowRight") {
        goNext();
      }
    },
    [goPrev, goNext]
  );

  const handleSubmit = useCallback(() => {
    const answers: QuestionAnswer[] = questions.map((question, index) => ({
      questionIndex: index,
      value: toAnswerValue(draft[index] ?? EMPTY_DRAFT_VALUE, question.multiSelect),
    }));
    onSubmit(toolUseId, answers);
  }, [questions, draft, onSubmit, toolUseId]);

  const toggleRespond = useCallback(() => setShowRespond((shown) => !shown), []);

  const handleResponseChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setResponseText(event.target.value),
    []
  );

  const handleRespond = useCallback(() => {
    if (responseText.trim()) {
      onRespond(toolUseId, responseText.trim());
    }
  }, [responseText, onRespond, toolUseId]);

  const handleResponseKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        handleRespond();
      }
    },
    [handleRespond]
  );

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="border border-primary/30 rounded-lg bg-surface-elevated p-3 space-y-3" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-sm font-medium text-primary">Agent needs input</span>
        </div>
        <span className="text-xs text-text-muted">
          {currentIndex + 1} of {total}
        </span>
      </div>

      <QuestionStepper
        questions={questions}
        currentIndex={currentIndex}
        answeredIndices={answeredIndices}
        onSelect={goToIndex}
      />

      {/* Question body - re-keyed per page so the page transition animates */}
      <div key={currentIndex} className="animate-fade-slide-up">
        <QuestionItem
          question={currentQuestion}
          index={currentIndex}
          value={draft[currentIndex] ?? EMPTY_DRAFT_VALUE}
          onChange={handleValueChange}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="p-1 rounded-md text-text-muted hover:text-text-neutral disabled:opacity-40 disabled:hover:text-text-muted transition-colors"
          aria-label="Previous question"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === total - 1}
          className="p-1 rounded-md text-text-muted hover:text-text-neutral disabled:opacity-40 disabled:hover:text-text-muted transition-colors"
          aria-label="Next question"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="flex-1" />

        {total > 1 && (
          <button
            type="button"
            onClick={toggleRespond}
            title="Skip all questions and reply instead"
            className="px-3 py-1 rounded-md bg-surface-inset text-text-muted text-xs font-medium hover:text-text-neutral transition-colors"
          >
            Reply instead
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors",
            allAnswered
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-surface-inset text-text-muted opacity-60"
          )}
        >
          Submit
        </button>
      </div>

      {/* Freeform response - only offered when there are multiple questions to skip */}
      {total > 1 && showRespond && (
        <div className="flex gap-2">
          <input
            type="text"
            value={responseText}
            onChange={handleResponseChange}
            onKeyDown={handleResponseKeyDown}
            placeholder="Reply to the agent instead…"
            className="flex-1 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-base text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
          <button
            type="button"
            onClick={handleRespond}
            disabled={!responseText.trim()}
            className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 disabled:opacity-40 transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
