import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../utils/cn.js";

interface ChipProps {
  label: string;
  /** Secondary control rendered before the label, for a selection carrying more than membership */
  leadingControl?: ReactNode;
  /** When provided, renders a trailing remove button */
  onRemove?: () => void;
  /** Accessible name for the remove button; defaults to `Remove {label}` */
  removeAriaLabel?: string;
  /** Typography and colour of the label — the caller owns the chip's flavour */
  className?: string;
}

/** Compact bordered label pill, optionally removable and optionally carrying a leading control. */
export function Chip({ label, leadingControl, onRemove, removeAriaLabel, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 max-w-full rounded-sm border border-border bg-surface-elevated py-0.5 text-2xs",
        leadingControl ? "pl-0.5" : "pl-1.5",
        onRemove ? "pr-0.5" : "pr-1.5",
        className
      )}
    >
      {leadingControl && <span className="shrink-0">{leadingControl}</span>}
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
