import type { ComponentType, ReactNode } from "react";
import { cn } from "../../utils/cn.js";

interface ActionBarProps {
  /** Left slot — status/context info (text, status dots, labels) */
  left?: ReactNode;
  /** Right slot — action buttons (save, create, compact, etc.) */
  right?: ReactNode;
}

interface ActionBarButtonProps {
  /** Icon component rendered before the label */
  icon?: ComponentType<{ className?: string }>;
  /** Button label text */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Disable the button */
  disabled?: boolean;
  /** Primary treatment (filled background) */
  isPrimary?: boolean;
  /** Destructive treatment (error color) */
  isDestructive?: boolean;
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

/**
 * Shared action button for use inside ActionBar right slot.
 * Supports default (muted), primary (filled), and destructive (error) treatments.
 */
export function ActionBarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  isPrimary,
  isDestructive,
}: ActionBarButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40",
        isDestructive
          ? "text-error hover:bg-error/10"
          : isPrimary
            ? "bg-primary text-text-primary hover:opacity-90"
            : "text-text-muted hover:text-text-primary hover:bg-surface-elevated"
      )}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
