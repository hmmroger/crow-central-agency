import { cn } from "../../utils/cn.js";

/** Counts above this render as `{cap}+` */
const BADGE_COUNT_CAP = 99;

export interface BadgeProps {
  /** Number to display; renders a dot when absent */
  count?: number;
  /** Positioning supplied by the host (e.g. absolute corner overlay) */
  className?: string;
}

/** Decorative count pill or attention dot; hosts expose the meaning in their accessible name. */
export function Badge({ count, className }: BadgeProps) {
  if (count === undefined) {
    return <span aria-hidden="true" className={cn("block h-2 w-2 rounded-full bg-primary", className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-text-primary text-3xs font-semibold leading-none tabular-nums",
        className
      )}
    >
      {count > BADGE_COUNT_CAP ? `${BADGE_COUNT_CAP}+` : count}
    </span>
  );
}
