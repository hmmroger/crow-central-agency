import { useCallback } from "react";
import type { AskUserQuestionItem } from "@crow-central-agency/shared";
import { QuestionOption } from "./question-option.js";
import type { QuestionDraftValue } from "./ask-user-question-panel.types.js";

interface QuestionItemProps {
  question: AskUserQuestionItem;
  index: number;
  value: QuestionDraftValue;
  onChange: (index: number, value: QuestionDraftValue) => void;
}

/**
 * Renders a single question: its text, its options (radio-style for single-select, toggleable chips
 * for multi-select), and an always-available free-text "Other" entry. Labels and free-text are
 * tracked separately, so typing a label-matching string never collapses into an option selection.
 * Single-select free-text is mutually exclusive with a label; multi-select free-text coexists.
 */
export function QuestionItem({ question, index, value, onChange }: QuestionItemProps) {
  const { multiSelect, options, allowFreeformResponse } = question;
  const { labels, freeText } = value;
  const showFreeform = allowFreeformResponse !== false;

  const isOptionActive = useCallback(
    (label: string): boolean => (multiSelect ? labels.includes(label) : labels[0] === label),
    [multiSelect, labels]
  );

  const handleSelect = useCallback(
    (label: string) => {
      if (!multiSelect) {
        onChange(index, { labels: [label], freeText: "" });
        return;
      }

      const nextLabels = labels.includes(label) ? labels.filter((entry) => entry !== label) : [...labels, label];
      onChange(index, { labels: nextLabels, freeText });
    },
    [multiSelect, labels, freeText, onChange, index]
  );

  const handleFreeTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      if (!multiSelect) {
        onChange(index, { labels: [], freeText: text });
        return;
      }

      onChange(index, { labels, freeText: text });
    },
    [multiSelect, labels, onChange, index]
  );

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-base">{question.question}</p>

      <div className="space-y-1.5">
        {options.map((option) => (
          <QuestionOption
            key={option.label}
            label={option.label}
            description={option.description}
            preview={option.preview}
            active={isOptionActive(option.label)}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {showFreeform && (
        <label className="block">
          <span className="text-xs text-text-muted">Other</span>
          <input
            type="text"
            value={freeText}
            onChange={handleFreeTextChange}
            placeholder="Type your own answer…"
            className="mt-1 w-full rounded bg-surface-inset border border-border-subtle px-2 py-1 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-border-focus"
          />
        </label>
      )}
    </div>
  );
}
