import { NAV_NOTIFICATION_KIND, type NavNotification } from "../../providers/notifications-provider.types.js";
import { cn } from "../../utils/cn.js";

/** Counts above this render as `{cap}+` */
const NAV_BADGE_COUNT_CAP = 99;

interface NavBadgeProps {
  notification: NavNotification;
  /** Positioning supplied by the host (e.g. absolute corner overlay) */
  className?: string;
}

/**
 * Visual nav badge: a capped count pill or an attention dot.
 * Decorative only; hosts expose the notification description in their accessible name.
 */
export function NavBadge({ notification, className }: NavBadgeProps) {
  if (notification.kind === NAV_NOTIFICATION_KIND.DOT) {
    return <span aria-hidden="true" className={cn("block h-2 w-2 rounded-full bg-primary", className)} />;
  }

  const countLabel = notification.count > NAV_BADGE_COUNT_CAP ? `${NAV_BADGE_COUNT_CAP}+` : `${notification.count}`;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-text-primary text-3xs font-semibold leading-none tabular-nums",
        className
      )}
    >
      {countLabel}
    </span>
  );
}
