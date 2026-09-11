import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, Rss } from "lucide-react";
import type { ConfiguredFeed } from "@crow-central-agency/shared";
import { useFeedsQuery } from "../../hooks/queries/use-feeds-query.js";
import { cn } from "../../utils/cn.js";
import { ComboboxDropdown } from "./combobox-dropdown.js";
import { ComboboxOption } from "./combobox-option.js";
import { useComboboxDropdown } from "./use-combobox-dropdown.js";
import { FeedChip } from "./feed-chip.js";

interface FeedMultiSelectProps {
  /** Feeds currently configured for the agent (selection + per-feed isNotify) */
  configuredFeeds: ConfiguredFeed[];
  /** Fired when the user toggles a feed's selection */
  onToggle: (feedId: string) => void;
  /** Fired when the user toggles a selected feed's isNotify flag */
  onToggleNotify: (feedId: string) => void;
  /** Copy shown above the input */
  helperText?: string;
  /** Text shown when no feeds are configured */
  emptyText?: string;
}

interface SelectedFeed {
  feedId: string;
  title: string;
  isNotify: boolean;
}

/**
 * Type-ahead picker for the feeds an agent reads from. Typing narrows the option list and the
 * chevron browses every feed; Enter/Tab toggles the highlighted option. Selected feeds stay in the
 * list with a selected marker and also render as removable chips below the input, each carrying its
 * own new-item notification toggle.
 * Renders its own content only — the caller owns the surrounding label / layout.
 */
export function FeedMultiSelect({
  configuredFeeds,
  onToggle,
  onToggleNotify,
  helperText,
  emptyText = "No feeds available.",
}: FeedMultiSelectProps) {
  const { data: feeds, isLoading } = useFeedsQuery();
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const needle = inputValue.trim().toLowerCase();

  const sortedFeeds = useMemo(
    () => (feeds ? feeds.slice().sort((feedA, feedB) => feedA.title.localeCompare(feedB.title)) : []),
    [feeds]
  );

  const options = useMemo(
    () => sortedFeeds.filter((feed) => feed.title.toLowerCase().includes(needle)),
    [sortedFeeds, needle]
  );

  const selectedFeedIds = useMemo(() => new Set(configuredFeeds.map((entry) => entry.feedId)), [configuredFeeds]);

  const selectedFeeds = useMemo<SelectedFeed[]>(() => {
    const titleByFeedId = new Map(sortedFeeds.map((feed): [string, string] => [feed.id, feed.title]));
    const resolved: SelectedFeed[] = [];
    for (const entry of configuredFeeds) {
      const title = titleByFeedId.get(entry.feedId);
      if (title !== undefined) {
        resolved.push({ feedId: entry.feedId, title, isNotify: entry.isNotify === true });
      }
    }

    return resolved;
  }, [configuredFeeds, sortedFeeds]);

  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) {
        return;
      }

      onToggle(option.id);
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
    handleKeyDown,
    handleContainerBlur,
    referenceRef,
    referenceProps,
    floatingRef,
    floatingProps,
    floatingStyles,
  } = useComboboxDropdown({
    optionCount: options.length,
    onCommitOption: selectOption,
    keepActiveIndexOnCommit: true,
  });

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInputValue(event.target.value);
      setActiveIndex(0);
      open();
    },
    [setActiveIndex, open]
  );

  const handleToggleOpen = useCallback(() => {
    toggle();
    if (!isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen, toggle]);

  if (isLoading || !feeds || feeds.length === 0) {
    return <p className="text-xs text-text-muted">{isLoading ? "Loading feeds..." : emptyText}</p>;
  }

  return (
    <div className="space-y-1.5">
      {helperText && <p className="text-xs text-text-muted">{helperText}</p>}

      <div
        ref={referenceRef}
        {...referenceProps}
        onBlur={handleContainerBlur}
        className={cn(
          "flex items-center gap-1.5 rounded border bg-surface-inset px-2 py-1 transition-colors",
          isOpen ? "border-border-focus" : "border-border-subtle"
        )}
      >
        <Rss className="h-3 w-3 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={open}
          placeholder="Search feeds by title..."
          aria-label="Search feeds by title"
          className="min-w-0 flex-1 bg-transparent text-xs text-text-base placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleToggleOpen}
          aria-label={isOpen ? "Hide feeds" : "Browse feeds"}
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
          emptyMessage="No feeds match the filter."
        >
          {options.map((feed, index) => (
            <ComboboxOption
              key={feed.id}
              index={index}
              isActive={index === activeIndex}
              isSelected={selectedFeedIds.has(feed.id)}
              onActivate={setActiveIndex}
              onCommit={commitOption}
            >
              <span className="min-w-0 flex-1 truncate">{feed.title}</span>
            </ComboboxOption>
          ))}
        </ComboboxDropdown>
      )}

      {selectedFeeds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedFeeds.map((selected) => (
            <FeedChip
              key={selected.feedId}
              feedId={selected.feedId}
              title={selected.title}
              isNotify={selected.isNotify}
              onToggleNotify={onToggleNotify}
              onRemove={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
