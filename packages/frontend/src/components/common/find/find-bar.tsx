import { useCallback, type KeyboardEvent, type RefObject } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { hasCommandModifier } from "../../../utils/platform-utils.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../action-button.js";
import type { FindResult } from "./find.types.js";

interface FindBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  isCaseSensitive: boolean;
  result: FindResult;
  onQueryChange: (query: string) => void;
  onCaseSensitiveToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

const QUERY_LABEL = "Find";
const NO_RESULTS_LABEL = "No results";

/** Display-only find bar: the query, its match count, stepping, match case and close */
export function FindBar({
  inputRef,
  query,
  isCaseSensitive,
  result,
  onQueryChange,
  onCaseSensitiveToggle,
  onNext,
  onPrevious,
  onClose,
}: FindBarProps) {
  const hasMatches = result.total > 0;
  const count = hasMatches ? `${(result.currentIndex ?? 0) + 1} of ${result.total}` : NO_RESULTS_LABEL;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Enter" && event.target === inputRef.current && !hasCommandModifier(event.nativeEvent)) {
        event.preventDefault();
        if (event.shiftKey) {
          onPrevious();
        } else {
          onNext();
        }
      }
    },
    [inputRef, onClose, onNext, onPrevious]
  );

  return (
    <div
      role="search"
      className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label={QUERY_LABEL}
        placeholder={QUERY_LABEL}
        className="min-w-0 flex-1 rounded-md border border-border bg-surface-inset px-2 py-1 text-xs text-text-base outline-none focus:border-border-focus"
      />
      {query && <span className="shrink-0 text-2xs text-text-muted">{count}</span>}
      <ActionButton
        icon={CaseSensitive}
        label="Match case"
        variant={ACTION_BUTTON_VARIANT.GHOST}
        iconOnly
        isActive={isCaseSensitive}
        onClick={onCaseSensitiveToggle}
      />
      <ActionButton
        icon={ChevronUp}
        label="Previous match"
        variant={ACTION_BUTTON_VARIANT.GHOST}
        iconOnly
        disabled={!hasMatches}
        onClick={onPrevious}
      />
      <ActionButton
        icon={ChevronDown}
        label="Next match"
        variant={ACTION_BUTTON_VARIANT.GHOST}
        iconOnly
        disabled={!hasMatches}
        onClick={onNext}
      />
      <ActionButton icon={X} label="Close find" variant={ACTION_BUTTON_VARIANT.GHOST} iconOnly onClick={onClose} />
    </div>
  );
}
