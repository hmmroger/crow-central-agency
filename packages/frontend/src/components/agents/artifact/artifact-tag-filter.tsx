import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
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
import { ChevronDown, Tag } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { TagChip } from "./tag-chip.js";

interface ArtifactTagFilterProps {
  /** Distinct tags available across the current list, in display order */
  allTags: string[];
  /** Currently selected tag filters */
  selectedTags: string[];
  /** Toggle a single tag's selection */
  onToggle: (tag: string) => void;
  /** Clear all selected tags */
  onClear: () => void;
}

/**
 * Type-ahead combobox for filtering the artifact list by tag.
 * Typing narrows the autosuggest list; the chevron browses every available tag.
 * Enter/Tab completes the highlighted suggestion and Backspace on an empty input
 * removes the last selection. Selected tags appear as removable chips below the
 * input. The consumer applies AND semantics (artifact must carry every chip).
 */
export function ArtifactTagFilter({ allTags, selectedTags, onToggle, onClear }: ArtifactTagFilterProps) {
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

  const suggestions = useMemo(() => {
    const needle = inputValue.trim().toLowerCase();
    return allTags.filter((tag) => !selectedTags.includes(tag) && tag.includes(needle));
  }, [allTags, selectedTags, inputValue]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(suggestions.length - 1, 0));

  const selectTag = useCallback(
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
          setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
          break;

        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((current) => Math.max(current - 1, 0));
          break;

        case "Enter":
        case "Tab":
          if (isOpen && suggestions[safeActiveIndex]) {
            event.preventDefault();
            selectTag(suggestions[safeActiveIndex]);
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
    [isOpen, suggestions, safeActiveIndex, selectTag, inputValue, selectedTags, onToggle]
  );

  const handleToggleOpen = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    inputRef.current?.focus();
  }, [isOpen]);

  return (
    <div className="space-y-1.5">
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
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
          onFocus={() => setIsOpen(true)}
          placeholder="Filter by tag…"
          aria-label="Filter by tag"
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
            {suggestions.length === 0 ? (
              <div className="px-2 py-1.5 text-2xs text-text-muted">
                {allTags.length === selectedTags.length ? "All tags selected" : "No matching tags"}
              </div>
            ) : (
              suggestions.map((tag, index) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  aria-selected={index === safeActiveIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectTag(tag)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors",
                    index === safeActiveIndex ? "bg-surface-hover text-text-base" : "text-text-neutral"
                  )}
                >
                  <span className="truncate">{tag}</span>
                </button>
              ))
            )}
          </div>
        </FloatingPortal>
      )}

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedTags.map((tag) => (
            <TagChip key={tag} label={tag} onRemove={() => onToggle(tag)} />
          ))}
          {selectedTags.length > 1 && (
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
