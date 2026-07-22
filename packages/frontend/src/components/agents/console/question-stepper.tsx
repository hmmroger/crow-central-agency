import { Check } from "lucide-react";
import type { AskUserQuestionItem } from "@crow-central-agency/shared";
import { cn } from "../../../utils/cn";

interface QuestionStepperProps {
  questions: AskUserQuestionItem[];
  currentIndex: number;
  answeredIndices: Set<number>;
  onSelect: (index: number) => void;
}

/**
 * Horizontal stepper — one segment per question labeled with its short header. Each segment shows its
 * state (answered / current / unanswered) and jumps to that question on click.
 */
export function QuestionStepper({ questions, currentIndex, answeredIndices, onSelect }: QuestionStepperProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {questions.map((question, index) => {
        const isCurrent = index === currentIndex;
        const isAnswered = answeredIndices.has(index);

        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors max-w-32",
              isCurrent
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : isAnswered
                  ? "bg-primary/10 text-primary hover:bg-primary/15"
                  : "bg-surface-inset text-text-muted hover:text-text-neutral"
            )}
          >
            {isAnswered && <Check className="h-3 w-3 shrink-0" />}
            <span className="truncate">{question.header}</span>
          </button>
        );
      })}
    </div>
  );
}
