import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import { hasCommandModifier } from "../../../utils/platform-utils.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../action-button.js";
import type { FindResult } from "./find.types.js";

interface FindBarProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  query: string;
  isCaseSensitive: boolean;
  /** Undefined until the surface reports for the current query */
  result?: FindResult;
  onQueryChange: (query: string) => void;
  onCaseSensitiveToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

const QUERY_LABEL = "Find";
const NO_RESULTS_LABEL = "No results";
const LINE_BREAK = "\n";
/** What Safari reports for a key that an input method is still processing */
const IME_PROCESS_KEY_CODE = 229;

/** Display-only find bar: the query, its match count, stepping, match case and close; the query may span lines */
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
  const hasMatches = result !== undefined && result.total > 0;
  const count = hasMatches ? `${(result.currentIndex ?? 0) + 1} of ${result.total}` : NO_RESULTS_LABEL;
  const status = query && result ? count : "";
  const pendingCaretRef = useRef<number>(undefined);

  // The newline goes through the query state, not the DOM, so React's value tracking stays in step.
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = undefined;
    if (caret !== undefined) {
      inputRef.current?.setSelectionRange(caret, caret);
    }
  }, [inputRef, query]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      const input = inputRef.current;
      if (event.key !== "Enter" || !input || event.target !== input) {
        return;
      }

      event.preventDefault();
      if (hasCommandModifier(event.nativeEvent)) {
        const { value, selectionStart, selectionEnd } = input;
        pendingCaretRef.current = selectionStart + LINE_BREAK.length;
        onQueryChange(value.slice(0, selectionStart) + LINE_BREAK + value.slice(selectionEnd));
      } else if (event.shiftKey) {
        onPrevious();
      } else {
        onNext();
      }
    },
    [inputRef, onClose, onNext, onPrevious, onQueryChange]
  );

  return (
    <div
      role="search"
      className="flex items-start gap-1.5 border-b border-border-subtle px-3 py-1.5"
      onKeyDown={handleKeyDown}
    >
      <textarea
        ref={inputRef}
        rows={query.split(LINE_BREAK).length}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label={QUERY_LABEL}
        placeholder={QUERY_LABEL}
        className="min-w-0 flex-1 max-h-40 resize-none overflow-y-auto rounded-md border border-border bg-surface-inset px-2 py-1 text-xs text-text-base outline-none focus:border-border-focus"
      />
      <span role="status" className="shrink-0 text-2xs text-text-muted">
        {status}
      </span>
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
