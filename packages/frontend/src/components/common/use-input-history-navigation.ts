import { useCallback, useRef } from "react";

interface UseInputHistoryNavigationParams {
  /** Recall entries, oldest first. */
  history: string[];
  /** Apply a recalled value (or the restored draft) to the controlled input. */
  setText: (value: string) => void;
  /** Whether the field is multi-line (textarea) and needs first/last-line caret guards. */
  multiline: boolean;
}

interface InputHistoryNavigation {
  /** Handle Arrow Up/Down for recall; consumes the event when it navigates. */
  handleArrowKey: (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  /** Exit recall so the next Up starts from the live draft again. */
  reset: () => void;
  /** Cancel recall, restoring the live draft. Returns false when not in recall. */
  exitRecall: () => boolean;
}

/** Caret sits on the first visual line when no newline precedes it. */
function isCaretOnFirstLine(value: string, caret: number): boolean {
  return !value.slice(0, caret).includes("\n");
}

/** Caret sits on the last visual line when no newline follows it. */
function isCaretOnLastLine(value: string, caret: number): boolean {
  return !value.slice(caret).includes("\n");
}

function moveCaretToEnd(element: HTMLTextAreaElement | HTMLInputElement): void {
  window.requestAnimationFrame(() => {
    const end = element.value.length;
    element.setSelectionRange(end, end);
  });
}

/**
 * Shell-style Up/Down recall over a list of previously submitted inputs.
 * The in-progress draft is preserved when recall starts and restored when the
 * user steps back past the newest entry. History is backend-owned; this hook
 * only navigates it and never mutates the source list.
 */
export function useInputHistoryNavigation({
  history,
  setText,
  multiline,
}: UseInputHistoryNavigationParams): InputHistoryNavigation {
  // undefined = showing the live draft; otherwise an index into `history`.
  const indexRef = useRef<number | undefined>(undefined);
  const draftRef = useRef<string>("");

  const reset = useCallback(() => {
    indexRef.current = undefined;
  }, []);

  const exitRecall = useCallback(() => {
    if (indexRef.current === undefined) {
      return false;
    }

    indexRef.current = undefined;
    setText(draftRef.current);
    return true;
  }, [setText]);

  const handleArrowKey = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (history.length === 0) {
        return;
      }

      const element = event.currentTarget;
      const caret = element.selectionStart ?? element.value.length;

      if (event.key === "ArrowUp") {
        if (multiline && !isCaretOnFirstLine(element.value, caret)) {
          return;
        }

        if (indexRef.current === undefined) {
          draftRef.current = element.value;
          indexRef.current = history.length - 1;
        } else {
          indexRef.current = Math.max(0, indexRef.current - 1);
        }

        event.preventDefault();
        setText(history[indexRef.current]);
        moveCaretToEnd(element);
        return;
      }

      if (event.key === "ArrowDown") {
        if (indexRef.current === undefined) {
          return;
        }

        if (multiline && !isCaretOnLastLine(element.value, caret)) {
          return;
        }

        const nextIndex = indexRef.current + 1;
        event.preventDefault();

        if (nextIndex >= history.length) {
          indexRef.current = undefined;
          setText(draftRef.current);
        } else {
          indexRef.current = nextIndex;
          setText(history[nextIndex]);
        }

        moveCaretToEnd(element);
      }
    },
    [history, setText, multiline]
  );

  return { handleArrowKey, reset, exitRecall };
}
