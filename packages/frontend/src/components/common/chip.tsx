import { X } from "lucide-react";
import { cn } from "../../utils/cn.js";

interface ChipProps {
  label: string;
  /** When provided, renders a trailing remove button */
  onRemove?: () => void;
  /** Accessible name for the remove button; defaults to `Remove {label}` */
  removeAriaLabel?: string;
  /** Typography and colour of the label — the caller owns the chip's flavour */
  className?: string;
}

/** Compact bordered label pill, optionally removable. */
export function Chip({ label, onRemove, removeAriaLabel, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 max-w-full rounded-sm border border-border bg-surface-elevated py-0.5 text-2xs",
        onRemove ? "pl-1.5 pr-0.5" : "px-1.5",
        className
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-xs p-0.5 text-text-muted hover:text-error transition-colors"
          aria-label={removeAriaLabel ?? `Remove ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
