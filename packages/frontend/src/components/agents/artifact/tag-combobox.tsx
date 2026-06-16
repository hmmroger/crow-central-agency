import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { ChevronDown, Plus, Tag } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { TagChip } from "./tag-chip.js";

interface TagComboboxProps {
  /** Existing tags to suggest, in display order */
  availableTags: string[];
  /** Currently selected tags */
  selectedTags: string[];
  /** Toggle a single tag (add when absent, remove when present) */
  onToggle: (tag: string) => void;
  /** Clear all selected tags; when provided, a "Clear" control shows once 2+ are selected */
  onClear?: () => void;
  /** Allow creating a tag that is not in availableTags (free-form entry) */
  allowCreate?: boolean;
  placeholder?: string;
}

interface TagOption {
  tag: string;
  isNew: boolean;
}

/** Light canonicalization mirroring the backend's normalize-on-write (trim + lowercase) */
function canonicalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Type-ahead combobox for selecting tags. Typing narrows the autosuggest list and
 * the chevron browses every available tag; Enter/Tab completes the highlighted
 * option and Backspace on an empty input removes the last selection. Selected tags
 * render as removable chips below the input. With `allowCreate`, a typed value that
 * is not an existing tag can be added as a new tag.
 *
 * Selection/filter semantics are owned by the consumer via `onToggle`.
 */
export function TagCombobox({
  availableTags,
  selectedTags,
  onToggle,
  onClear,
  allowCreate = false,
  placeholder = "Filter by tag...",
}: TagComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply: ({ rects, availableHeight, elements }) => {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            maxHeight: `${Math.min(availableHeight, 240)}px`,
          });
        },
      }),
    ],
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss, role]);

  const candidate = canonicalizeTag(inputValue);

  const options = useMemo<TagOption[]>(() => {
    const matches = availableTags
      .filter((tag) => !selectedTags.includes(tag) && tag.includes(candidate))
      .map((tag) => ({ tag, isNew: false }));

    const canCreate =
      allowCreate && candidate.length > 0 && !availableTags.includes(candidate) && !selectedTags.includes(candidate);

    return canCreate ? [...matches, { tag: candidate, isNew: true }] : matches;
  }, [availableTags, selectedTags, candidate, allowCreate]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(options.length - 1, 0));

  const selectOption = useCallback(
    (tag: string) => {
      onToggle(tag);
      setInputValue("");
      setActiveIndex(0);
      setIsOpen(true);
      inputRef.current?.focus();
    },
    [onToggle]
  );

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setActiveIndex(0);
    setIsOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setIsOpen(true);
          setActiveIndex((current) => (options.length === 0 ? 0 : Math.min(current + 1, options.length - 1)));
          break;

        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((current) => Math.max(current - 1, 0));
          break;

        case "Enter":
          if (isOpen && options[safeActiveIndex]) {
            event.preventDefault();
            selectOption(options[safeActiveIndex].tag);
          }

          break;

        case "Tab":
          if (isOpen && options[safeActiveIndex]) {
            event.preventDefault();
            selectOption(options[safeActiveIndex].tag);
          } else if (isOpen) {
            // Nothing to complete — close so Tab advances focus normally
            setIsOpen(false);
          }

          break;

        case "Escape":
          setIsOpen(false);
          break;

        case "Backspace":
          if (inputValue === "" && selectedTags.length > 0) {
            onToggle(selectedTags[selectedTags.length - 1]);
          }

          break;
      }
    },
    [isOpen, options, safeActiveIndex, selectOption, inputValue, selectedTags, onToggle]
  );

  const handleToggleOpen = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    inputRef.current?.focus();
  }, [isOpen]);

  const handleFocus = useCallback(() => setIsOpen(true), []);

  // Close when focus leaves the whole combobox. Options preventDefault their
  // mousedown (focus stays in the input) and the chevron lives inside the
  // container, so neither selecting an option nor toggling falsely closes it.
  // This covers clicks elsewhere inside a modal dialog, where floating-ui's
  // outside-press dismissal does not fire.
  const handleBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
      return;
    }

    setIsOpen(false);
  }, []);

  // Keep focus in the input when clicking an option so typing can continue
  const handleOptionMouseDown = useCallback((event: ReactMouseEvent) => event.preventDefault(), []);

  const emptyMessage =
    candidate.length > 0
      ? "No matching tags"
      : allowCreate
        ? "Type to add a tag"
        : availableTags.length > 0 && availableTags.every((tag) => selectedTags.includes(tag))
          ? "All tags selected"
          : "No tags available";

  return (
    <div className="space-y-1.5">
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        onBlur={handleBlur}
        className={cn(
          "flex items-center gap-1.5 rounded border bg-surface-inset px-2 py-1 transition-colors",
          isOpen ? "border-border-focus" : "border-border-subtle"
        )}
      >
        <Tag className="h-3 w-3 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs text-text-base placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label={isOpen ? "Hide tags" : "Browse tags"}
          className="shrink-0 text-text-muted hover:text-text-neutral transition-colors"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elevated"
          >
            {options.length === 0 ? (
              <div className="px-2 py-1.5 text-2xs text-text-muted">{emptyMessage}</div>
            ) : (
              options.map((option, index) => (
                <button
                  key={option.isNew ? `__new__${option.tag}` : option.tag}
                  type="button"
                  role="option"
                  aria-selected={index === safeActiveIndex}
                  onMouseDown={handleOptionMouseDown}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.tag)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors",
                    index === safeActiveIndex ? "bg-surface-hover text-text-base" : "text-text-neutral"
                  )}
                >
                  {option.isNew ? (
                    <>
                      <Plus className="h-3 w-3 shrink-0 text-text-muted" />
                      <span className="truncate">
                        Create <span className="text-text-base">{option.tag}</span>
                      </span>
                    </>
                  ) : (
                    <span className="truncate">{option.tag}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </FloatingPortal>
      )}

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedTags.map((tag) => (
            <TagChip key={tag} label={tag} onRemove={onToggle} />
          ))}
          {onClear && selectedTags.length > 1 && (
            <button
              type="button"
              onClick={onClear}
              className="ml-0.5 text-2xs text-text-muted hover:text-text-neutral transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
