import { useMemo, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import type { ConfiguredFeed } from "@crow-central-agency/shared";
import { useFeedsQuery } from "../../hooks/queries/use-feeds-query.js";
import { cn } from "../../utils/cn.js";

interface FeedMultiSelectProps {
  /** Feeds currently configured for the agent (selection + per-feed isNotify) */
  configuredFeeds: ConfiguredFeed[];
  /** Fired when the user toggles a feed's selection */
  onToggle: (feedId: string) => void;
  /** Fired when the user toggles a selected feed's isNotify flag */
  onToggleNotify: (feedId: string) => void;
  /** Copy shown above the filter input */
  helperText?: string;
  /** Text shown when no feeds are configured */
  emptyText?: string;
  /** Optional className passed to the outer container */
  className?: string;
}

/**
 * Filterable, scrollable, bounded checkbox list of subscribed feeds.
 * Renders a per-row notify toggle for selected feeds so the agent editor
 * can configure isNotify alongside the selection.
 *
 * Renders its own content only — the caller owns the surrounding label / layout.
 */
export function FeedMultiSelect({
  configuredFeeds,
  onToggle,
  onToggleNotify,
  helperText,
  emptyText = "No feeds available.",
  className,
}: FeedMultiSelectProps) {
  const { data: feeds, isLoading } = useFeedsQuery();
  const [filter, setFilter] = useState("");

  const configuredByFeedId = useMemo(() => {
    const map = new Map<string, ConfiguredFeed>();
    for (const entry of configuredFeeds) {
      map.set(entry.feedId, entry);
    }

    return map;
  }, [configuredFeeds]);

  const filteredFeeds = useMemo(() => {
    if (!feeds) {
      return [];
    }

    const needle = filter.trim().toLowerCase();
    if (!needle) {
      return feeds;
    }

    return feeds.filter((feed) => feed.title.toLowerCase().includes(needle));
  }, [feeds, filter]);

  if (isLoading || !feeds || feeds.length === 0) {
    return <p className="text-xs text-text-muted">{isLoading ? "Loading feeds..." : emptyText}</p>;
  }

  return (
    <div className={className}>
      {helperText && <p className="text-xs text-text-muted mb-2">{helperText}</p>}
      <input
        type="text"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter by title..."
        aria-label="Filter feeds by title"
        className="w-full mb-1.5 px-2 py-1 rounded border border-border-subtle bg-surface-inset text-xs text-text-base placeholder:text-text-muted focus:outline-none focus:border-border-focus"
      />
      <div className="max-h-48 overflow-y-auto rounded border border-border-subtle/40 bg-surface-inset/40 p-2">
        {filteredFeeds.length === 0 ? (
          <p className="text-xs text-text-muted">No feeds match the filter.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredFeeds.map((feed) => {
              const configured = configuredByFeedId.get(feed.id);
              const isSelected = configured !== undefined;
              const isNotify = configured?.isNotify === true;
              return (
                <div key={feed.id} className="flex items-center gap-2 min-w-0">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(feed.id)}
                      className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 shrink-0"
                    />
                    <span className="text-xs text-text-neutral truncate">{feed.title}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onToggleNotify(feed.id)}
                    disabled={!isSelected}
                    aria-pressed={isNotify}
                    aria-label={
                      isNotify
                        ? `Disable new-item notifications for ${feed.title}`
                        : `Enable new-item notifications for ${feed.title}`
                    }
                    title={isNotify ? "Notify on new items" : "Do not notify on new items"}
                    className={cn(
                      "shrink-0 p-1 rounded transition-colors",
                      isSelected ? "hover:bg-surface-elevated" : "opacity-30 cursor-not-allowed",
                      isSelected && isNotify ? "text-primary" : "text-text-muted"
                    )}
                  >
                    {isNotify ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Render-ready "N / total selected" label, undefined while feeds are still loading. */
export function useSelectedFeedCountLabel(selectedCount: number): string | undefined {
  const { data: feeds } = useFeedsQuery();
  return feeds ? `${selectedCount} / ${feeds.length} selected` : undefined;
}
