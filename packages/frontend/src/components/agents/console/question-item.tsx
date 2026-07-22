import { useCallback, useMemo } from "react";
import type { AskUserQuestionItem } from "@crow-central-agency/shared";
import { QuestionOption } from "./question-option.js";

type QuestionValue = string | string[];

interface QuestionItemProps {
  question: AskUserQuestionItem;
  index: number;
  value: QuestionValue;
  onChange: (index: number, value: QuestionValue) => void;
}

/**
 * Renders a single question: its text, its options (radio-style for single-select, toggleable chips
 * for multi-select), and an always-available free-text "Other" entry. Single-select free-text
 * overrides the label selection; multi-select free-text joins the selected labels in the value array.
 */
export function QuestionItem({ question, index, value, onChange }: QuestionItemProps) {
  const { multiSelect, options } = question;

  const labelSet = useMemo(() => new Set(options.map((option) => option.label)), [options]);

  const valueArray = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const valueString = typeof value === "string" ? value : "";

  const freeText = multiSelect
    ? (valueArray.find((entry) => !labelSet.has(entry)) ?? "")
    : labelSet.has(valueString)
      ? ""
      : valueString;

  const isOptionActive = useCallback(
    (label: string): boolean => (multiSelect ? valueArray.includes(label) : valueString === label),
    [multiSelect, valueArray, valueString]
  );

  const handleSelect = useCallback(
    (label: string) => {
      if (!multiSelect) {
        onChange(index, label);
        return;
      }

      const nonLabelEntries = valueArray.filter((entry) => !labelSet.has(entry));
      const selectedLabels = valueArray.filter((entry) => labelSet.has(entry));
      const nextLabels = selectedLabels.includes(label)
        ? selectedLabels.filter((entry) => entry !== label)
        : [...selectedLabels, label];

      onChange(index, [...nextLabels, ...nonLabelEntries]);
    },
    [multiSelect, valueArray, labelSet, onChange, index]
  );

  const handleFreeTextChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      if (!multiSelect) {
        onChange(index, text);
        return;
      }

      const selectedLabels = valueArray.filter((entry) => labelSet.has(entry));
      onChange(index, text.length > 0 ? [...selectedLabels, text] : selectedLabels);
    },
    [multiSelect, valueArray, labelSet, onChange, index]
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
    </div>
  );
}
