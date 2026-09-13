import { useCallback } from "react";
import { Bell, BellOff } from "lucide-react";
import { cn } from "../../utils/cn.js";
import { Chip } from "./chip.js";

interface FeedChipProps {
  feedId: string;
  title: string;
  /** Whether the agent is notified when the feed has new items */
  isNotify: boolean;
  /** Called with this chip's feed id */
  onToggleNotify: (feedId: string) => void;
  /** Called with this chip's feed id */
  onRemove: (feedId: string) => void;
}

/** Removable chip for one selected feed, carrying its new-item notification toggle. */
export function FeedChip({ feedId, title, isNotify, onToggleNotify, onRemove }: FeedChipProps) {
  const handleToggleNotify = useCallback(() => onToggleNotify(feedId), [onToggleNotify, feedId]);
  const handleRemove = useCallback(() => onRemove(feedId), [onRemove, feedId]);

  const notifyControl = (
    <button
      type="button"
      onClick={handleToggleNotify}
      aria-pressed={isNotify}
      aria-label={
        isNotify ? `Disable new-item notifications for ${title}` : `Enable new-item notifications for ${title}`
      }
      title={isNotify ? "Notify on new items" : "Do not notify on new items"}
      className={cn("rounded-xs p-0.5 transition-colors", isNotify ? "text-primary" : "text-text-muted")}
    >
      {isNotify ? <Bell className="h-2.5 w-2.5" /> : <BellOff className="h-2.5 w-2.5" />}
    </button>
  );

  return (
    <Chip
      label={title}
      leadingControl={notifyControl}
      onRemove={handleRemove}
      removeAriaLabel={`Remove feed ${title}`}
      className="text-text-neutral"
    />
  );
}
