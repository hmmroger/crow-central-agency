import type { ComponentType } from "react";
import { twMerge } from "tailwind-merge";

interface EmptyStateProps {
  message: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: ComponentType<{ className?: string }>;
  onAction?: () => void;
  className?: string;
}

/**
 * Empty state display - used when a list has no items or an error occurred.
 * Owns its own button rendering. Consumer provides label + callback, not JSX.
 * Consumer can override styling via className (merged with tailwind-merge).
 */
export function EmptyState({
  message,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={twMerge("h-full flex flex-col items-center justify-center gap-4 text-text-muted", className)}>
      <p className="text-lg">{message}</p>
      {description && <p className="text-sm">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-primary text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={onAction}
        >
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}
