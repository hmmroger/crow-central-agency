import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  description?: string;
  action?: ReactNode;
  messageClassName?: string;
}

/**
 * Empty state display — used when a list has no items or an error occurred.
 */
export function EmptyState({ message, description, action, messageClassName }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
      <p className={messageClassName ?? "text-lg"}>{message}</p>
      {description && <p className="text-sm">{description}</p>}
      {action}
    </div>
  );
}
