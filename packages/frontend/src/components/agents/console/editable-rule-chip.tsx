import { useCallback, useEffect, useState } from "react";

interface EditableRuleChipProps {
  /** Position of this rule in the owner's fixed-length array. */
  index: number;
  /** The committed rule text this chip edits. */
  value: string;
  /** Commit the edited text back to the owner. */
  onCommit: (index: number, value: string) => void;
}

/** Minimum input width in characters so a short or emptied rule stays clickable. */
const MIN_CHIP_SIZE = 8;

/**
 * A single rule under "Always allow will remember:" as an inline editable chip. Holds its own draft:
 * Enter and blur commit, Escape reverts to the last committed value.
 */
export function EditableRuleChip({ index, value, onCommit }: EditableRuleChipProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(event.target.value);
  }, []);

  const handleBlur = useCallback(() => {
    onCommit(index, draft);
  }, [onCommit, index, draft]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onCommit(index, draft);
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setDraft(value);
      }
    },
    [onCommit, index, draft, value]
  );

  return (
    <input
      type="text"
      value={draft}
      size={Math.max(draft.length, MIN_CHIP_SIZE)}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      className="max-w-full font-mono text-text-neutral bg-surface-inset rounded px-1.5 py-0.5 border border-transparent focus:outline-none focus:border-border-focus"
    />
  );
}
