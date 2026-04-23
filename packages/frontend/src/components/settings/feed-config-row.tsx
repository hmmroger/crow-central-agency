import { Rss, Trash2 } from "lucide-react";
import type { FeedInfo } from "@crow-central-agency/shared";
import { useDeleteFeed } from "../../hooks/queries/use-feed-mutations.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { cn } from "../../utils/cn.js";
import { formatRelativeTime, formatUrlDomain } from "../../utils/format-utils.js";

interface FeedConfigRowProps {
  feed: FeedInfo;
  /** True if this feed is enabled for Super Crow. */
  isSuperCrow: boolean;
  /** Toggle this feed's Super Crow membership. Expected to apply optimistically. */
  onSuperCrowToggle: (feedId: string) => void;
  /** Disable the Super Crow toggle while a settings mutation is in flight. */
  isSuperCrowPending: boolean;
}

/**
 * Compact table row for a single feed in the settings list.
 * Renders as a <tr> — must be used inside a <tbody>.
 */
export function FeedConfigRow({ feed, isSuperCrow, onSuperCrowToggle, isSuperCrowPending }: FeedConfigRowProps) {
  const { deleteFn, isPending: isDeleting } = useDeleteFeed(feed.id);
  const confirm = useConfirmDialog();

  const handleDelete = () => {
    confirm({
      title: "Remove Feed",
      message: `Remove "${feed.title}"? This will delete all cached items for this feed.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: deleteFn,
    });
  };

  const lastItem = feed.latestItemPublishedTime > 0 ? formatRelativeTime(feed.latestItemPublishedTime) : "—";

  return (
    <tr
      className={cn(
        "group border-b border-border-subtle/40 last:border-b-0 hover:bg-surface-elevated/50 transition-colors",
        feed.isUnreachable && "opacity-50"
      )}
    >
      {/* Image + Title */}
      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-2 min-w-0">
          {feed.imageUrl ? (
            <img src={feed.imageUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
          ) : (
            <div className="h-5 w-5 rounded bg-surface-elevated shrink-0 flex items-center justify-center">
              <Rss className="h-3 w-3 text-text-muted" />
            </div>
          )}
          <span className="text-sm text-text-base truncate">{feed.title}</span>
          {feed.isUnreachable && <span className="shrink-0 text-3xs text-warning">unreachable</span>}
        </div>
      </td>

      {/* Domain */}
      <td className="py-1.5 pr-3">
        <span className="text-xs text-text-muted truncate block">{formatUrlDomain(feed.feedUrl)}</span>
      </td>

      {/* Last item */}
      <td className="py-1.5 pr-3 whitespace-nowrap">
        <span className="text-xs text-text-muted">{lastItem}</span>
      </td>

      {/* Super Crow access toggle */}
      <td className="py-1.5 pr-3 text-center">
        <input
          type="checkbox"
          checked={isSuperCrow}
          onChange={() => onSuperCrowToggle(feed.id)}
          disabled={isSuperCrowPending}
          aria-label={`${isSuperCrow ? "Disable" : "Enable"} Super Crow access for ${feed.title}`}
          title="Enable for Super Crow"
          className="rounded border-border-subtle bg-surface-inset text-primary focus:ring-primary/30 disabled:opacity-40"
        />
      </td>

      {/* Delete */}
      <td className="py-1.5">
        <button
          type="button"
          className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 transition-all disabled:opacity-40"
          onClick={handleDelete}
          disabled={isDeleting}
          title="Remove feed"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
