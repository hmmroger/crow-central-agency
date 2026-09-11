import { useCallback, useEffect, useState, type KeyboardEvent } from "react";

interface UseActiveIndexNavParams {
  itemCount: number;
  /** Changing this returns the highlight to the first item */
  resetToken?: string;
  onCommit: (index: number) => void;
}

interface ActiveIndexNavControls {
  /** Clamped to the current itemCount */
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  /** For the text input: ArrowUp/ArrowDown/Home/End/Enter. Escape is left to bubble to useDismiss. */
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Headless active-index navigation for a listbox driven from a text input.
 * The index is virtual - DOM focus stays wherever the consumer put it, so the
 * consumer is responsible for exposing the active item via aria-activedescendant.
 */
export function useActiveIndexNav({
  itemCount,
  resetToken,
  onCommit,
}: UseActiveIndexNavParams): ActiveIndexNavControls {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [resetToken]);

  const safeActiveIndex = itemCount === 0 ? 0 : Math.min(activeIndex, itemCount - 1);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex(itemCount === 0 ? 0 : (safeActiveIndex + 1) % itemCount);
          break;

        case "ArrowUp":
          event.preventDefault();
          setActiveIndex(itemCount === 0 ? 0 : (safeActiveIndex - 1 + itemCount) % itemCount);
          break;

        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;

        case "End":
          event.preventDefault();
          setActiveIndex(Math.max(itemCount - 1, 0));
          break;

        case "Enter":
          if (itemCount > 0) {
            event.preventDefault();
            onCommit(safeActiveIndex);
          }

          break;
      }
    },
    [itemCount, safeActiveIndex, onCommit]
  );

  return { activeIndex: safeActiveIndex, setActiveIndex, handleKeyDown };
}
