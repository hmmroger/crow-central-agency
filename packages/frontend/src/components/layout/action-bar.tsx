import type { ReactNode } from "react";

interface ActionBarProps {
  /** Left slot — status/context info (text, status dots, labels) */
  left?: ReactNode;
  /** Right slot — action buttons (save, create, compact, etc.) */
  right?: ReactNode;
}

/**
 * Reusable action bar — rendered by each view below the app header.
 * Left slot for status/context, right slot for action buttons.
 * Consistent height and styling across all views.
 */
export function ActionBar({ left, right }: ActionBarProps) {
  return (
    <div className="flex items-center justify-between h-10 px-4 border-b border-border-subtle bg-surface/50 shrink-0">
      <div className="flex items-center gap-3 min-w-0 text-xs text-text-muted">{left}</div>
      <div className="flex items-center gap-1 shrink-0">{right}</div>
    </div>
  );
}
