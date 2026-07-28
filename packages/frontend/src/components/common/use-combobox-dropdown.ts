import { useCallback, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type ReferenceType,
} from "@floating-ui/react";

interface UseComboboxDropdownParams {
  optionCount: number;
  onCommitOption: (index: number) => void;
  /** Tab. Defaults to onCommitOption when omitted. */
  onCompleteOption?: (index: number) => void;
}

export interface ComboboxFloatingBindings {
  referenceRef: (node: ReferenceType | null) => void;
  referenceProps: Record<string, unknown>;
  floatingRef: (node: HTMLElement | null) => void;
  floatingProps: Record<string, unknown>;
  floatingStyles: CSSProperties;
}

export interface ComboboxDropdownControls extends ComboboxFloatingBindings {
  isOpen: boolean;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  commitOption: (index: number) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** ArrowUp/ArrowDown/Enter/Tab/Escape only; consumers handle other keys themselves. */
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  handleContainerBlur: (event: FocusEvent<HTMLDivElement>) => void;
}

const DROPDOWN_OFFSET_PX = 4;
const DROPDOWN_VIEWPORT_PADDING_PX = 8;
const DROPDOWN_MAX_HEIGHT_PX = 240;

/**
 * Headless type-ahead dropdown mechanics: open state, clamped active index, keyboard handling, blur
 * containment and floating-ui positioning. Option content and filtering stay with the consumer.
 */
export function useComboboxDropdown({
  optionCount,
  onCommitOption,
  onCompleteOption,
}: UseComboboxDropdownParams): ComboboxDropdownControls {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
    middleware: [
      offset(DROPDOWN_OFFSET_PX),
      flip({ padding: DROPDOWN_VIEWPORT_PADDING_PX }),
      shift({ padding: DROPDOWN_VIEWPORT_PADDING_PX }),
      size({
        padding: DROPDOWN_VIEWPORT_PADDING_PX,
        apply: ({ rects, availableHeight, elements }) => {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${Math.min(availableHeight, DROPDOWN_MAX_HEIGHT_PX)}px`,
          });
        },
      }),
    ],
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(optionCount - 1, 0));

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  // Both paths change what the consumer filters on, so the highlight returns to the top rather
  // than landing on an unrelated neighbour in the surviving list.
  const commitOption = useCallback(
    (index: number) => {
      setActiveIndex(0);
      onCommitOption(index);
    },
    [onCommitOption]
  );

  const completeOption = useCallback(
    (index: number) => {
      setActiveIndex(0);
      (onCompleteOption ?? onCommitOption)(index);
    },
    [onCompleteOption, onCommitOption]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setIsOpen(true);
          setActiveIndex((current) => (optionCount === 0 ? 0 : Math.min(current + 1, optionCount - 1)));
          break;

        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((current) => Math.max(current - 1, 0));
          break;

        case "Enter":
          if (isOpen && optionCount > 0) {
            event.preventDefault();
            commitOption(safeActiveIndex);
          }

          break;

        case "Tab":
          if (isOpen && optionCount > 0) {
            event.preventDefault();
            completeOption(safeActiveIndex);
          } else if (isOpen) {
            // Nothing to complete — close so Tab advances focus normally
            setIsOpen(false);
          }

          break;

        case "Escape":
          setIsOpen(false);
          break;
      }
    },
    [isOpen, optionCount, safeActiveIndex, commitOption, completeOption]
  );

  // Close when focus leaves the whole combobox. Options preventDefault their mousedown (focus stays
  // in the input) and any trigger lives inside the container, so neither selecting an option nor
  // toggling falsely closes it. This covers clicks elsewhere inside a modal dialog, where
  // floating-ui's outside-press dismissal does not fire. The portaled dropdown is not a DOM
  // descendant of the container, but it never takes focus, so containment on the container is
  // sufficient — keep dropdown content non-focusable.
  const handleContainerBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
      return;
    }

    setIsOpen(false);
  }, []);

  return {
    isOpen,
    activeIndex: safeActiveIndex,
    setActiveIndex,
    commitOption,
    open,
    close,
    toggle,
    handleKeyDown,
    handleContainerBlur,
    referenceRef: refs.setReference,
    referenceProps: getReferenceProps(),
    floatingRef: refs.setFloating,
    floatingProps: getFloatingProps(),
    floatingStyles,
  };
}
