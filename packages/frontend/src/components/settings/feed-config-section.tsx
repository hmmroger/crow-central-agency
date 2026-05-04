import { useCallback, useMemo } from "react";
import { Bird, Plus, RefreshCw } from "lucide-react";
import { useFeedsQuery } from "../../hooks/queries/use-feeds-query.js";
import { useOpenFeedAddDialog } from "../../hooks/dialogs/use-open-feed-add-dialog.js";
import { useSuperCrowSettingsQuery, useUpdateSuperCrowSettings } from "../../hooks/queries/use-super-crow-settings.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { FeedConfigRow } from "./feed-config-row.js";

/**
 * Feed Configuration section within the Settings view.
 * Compact table listing subscribed RSS/Atom feeds with add/remove actions
 * and a per-feed Super Crow access toggle.
 */
export function FeedConfigSection() {
  const { data: feeds = [], isLoading, error, refetch } = useFeedsQuery();
  const { data: superCrowSettings } = useSuperCrowSettingsQuery();
  const updateSuperCrow = useUpdateSuperCrowSettings();
  const openAddDialog = useOpenFeedAddDialog();

  const superCrowFeedIds = useMemo(
    () => new Set((superCrowSettings?.configuredFeeds ?? []).map((entry) => entry.feedId)),
    [superCrowSettings]
  );

  const handleSuperCrowToggle = useCallback(
    (feedId: string) => {
      const current = superCrowSettings?.configuredFeeds ?? [];
      const next = current.some((entry) => entry.feedId === feedId)
        ? current.filter((entry) => entry.feedId !== feedId)
        : [...current, { feedId }];
      updateSuperCrow.mutate({ configuredFeeds: next });
    },
    [superCrowSettings, updateSuperCrow]
  );

  const feedCount = feeds.length;

  return (
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-base">
          Feeds{feedCount > 0 && <span className="text-text-muted ml-1.5">({feedCount})</span>}
        </h3>
        <ActionButton
          icon={Plus}
          label="Add Feed"
          onClick={openAddDialog}
          variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
        />
      </div>

      {/* Loading */}
      {isLoading && <p className="text-sm text-text-muted">Loading feeds...</p>}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-error/10 border border-error/20 text-error text-sm">
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
            onClick={() => void refetch()}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && feedCount === 0 && (
        <p className="text-sm text-text-muted">
          No feeds configured. Click &quot;Add Feed&quot; to subscribe to an RSS or Atom feed.
        </p>
      )}

      {/* Compact feed table */}
      {feedCount > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-border-subtle/60 bg-surface">
          <table className="w-full table-fixed">
            <colgroup>
              <col />
              <col className="hidden md:table-column w-44" />
              <col className="w-24" />
              <col className="w-10" />
              <col className="w-6" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-subtle/60 text-left">
                <th className="py-1.5 pl-3 pr-3 text-3xs font-medium text-text-muted uppercase tracking-wider">Feed</th>
                <th className="hidden md:table-cell py-1.5 pr-3 text-3xs font-medium text-text-muted uppercase tracking-wider">
                  Source
                </th>
                <th className="py-1.5 pr-3 text-3xs font-medium text-text-muted uppercase tracking-wider">Last Item</th>
                <th
                  className="py-1.5 pr-3 text-text-muted"
                  title="Enable for Super Crow"
                  aria-label="Enable for Super Crow"
                >
                  <Bird className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th />
              </tr>
            </thead>
            <tbody className="[&_td:first-child]:pl-3">
              {feeds.map((feed) => (
                <FeedConfigRow
                  key={feed.id}
                  feed={feed}
                  isSuperCrow={superCrowFeedIds.has(feed.id)}
                  onSuperCrowToggle={handleSuperCrowToggle}
                  isSuperCrowPending={updateSuperCrow.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
