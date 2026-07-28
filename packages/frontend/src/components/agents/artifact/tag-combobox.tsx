import { useCallback, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ChevronDown, Plus, Tag } from "lucide-react";
import { cn } from "../../../utils/cn.js";
import { ComboboxDropdown } from "../../common/combobox-dropdown.js";
import { ComboboxOption } from "../../common/combobox-option.js";
import { useComboboxDropdown } from "../../common/use-combobox-dropdown.js";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const candidate = canonicalizeTag(inputValue);

  const options = useMemo<TagOption[]>(() => {
    const matches = availableTags
      .filter((tag) => !selectedTags.includes(tag) && tag.includes(candidate))
      .map((tag) => ({ tag, isNew: false }));

    const canCreate =
      allowCreate && candidate.length > 0 && !availableTags.includes(candidate) && !selectedTags.includes(candidate);

    return canCreate ? [...matches, { tag: candidate, isNew: true }] : matches;
  }, [availableTags, selectedTags, candidate, allowCreate]);

  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) {
        return;
      }

      onToggle(option.tag);
      setInputValue("");
      inputRef.current?.focus();
    },
    [options, onToggle]
  );

  const {
    isOpen,
    activeIndex,
    setActiveIndex,
    commitOption,
    open,
    toggle,
    handleKeyDown: handleDropdownKeyDown,
    handleContainerBlur,
    referenceRef,
    referenceProps,
    floatingRef,
    floatingProps,
    floatingStyles,
  } = useComboboxDropdown({ optionCount: options.length, onCommitOption: selectOption });

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
      setActiveIndex(0);
      open();
    },
    [setActiveIndex, open]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Backspace") {
        if (inputValue === "" && selectedTags.length > 0) {
          onToggle(selectedTags[selectedTags.length - 1]);
        }

        return;
      }

      handleDropdownKeyDown(event);
    },
    [inputValue, selectedTags, onToggle, handleDropdownKeyDown]
  );

  const handleToggleOpen = useCallback(() => {
    toggle();
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen, toggle]);

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
        ref={referenceRef}
        {...referenceProps}
        onBlur={handleContainerBlur}
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
          onFocus={open}
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
        <ComboboxDropdown
          floatingRef={floatingRef}
          floatingStyles={floatingStyles}
          floatingProps={floatingProps}
          isEmpty={options.length === 0}
          emptyMessage={emptyMessage}
        >
          {options.map((option, index) => (
            <ComboboxOption
              key={option.isNew ? `create:${option.tag}` : `existing:${option.tag}`}
              index={index}
              isActive={index === activeIndex}
              onActivate={setActiveIndex}
              onCommit={commitOption}
            >
              {option.isNew ? (
                <>
                  <Plus className="h-3 w-3 shrink-0 text-text-muted" />
                  <span className="truncate font-mono">
                    Create <span className="text-text-base">{option.tag}</span>
                  </span>
                </>
              ) : (
                <span className="truncate font-mono">{option.tag}</span>
              )}
            </ComboboxOption>
          ))}
        </ComboboxDropdown>
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
