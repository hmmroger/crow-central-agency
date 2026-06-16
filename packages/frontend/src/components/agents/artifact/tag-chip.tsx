import { useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "../../../utils/cn.js";

interface TagChipProps {
  label: string;
  /** When provided, renders a trailing remove button; called with this chip's label */
  onRemove?: (label: string) => void;
  className?: string;
}

/**
 * Single tag chip — compact monospace label matching the panel's instrument
 * aesthetic. Read-only by default; pass `onRemove` to render a remove control.
 */
export function TagChip({ label, onRemove, className }: TagChipProps) {
  const handleRemove = useCallback(() => onRemove?.(label), [onRemove, label]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 max-w-full rounded-sm border border-border bg-surface-elevated py-0.5 font-mono text-2xs text-accent",
        onRemove ? "pl-1.5 pr-0.5" : "px-1.5",
        className
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          className="shrink-0 rounded-xs p-0.5 text-text-muted hover:text-error transition-colors"
          aria-label={`Remove tag ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
