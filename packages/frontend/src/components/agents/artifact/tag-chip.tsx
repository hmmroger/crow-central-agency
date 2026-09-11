import { useCallback } from "react";
import { cn } from "../../../utils/cn.js";
import { Chip } from "../../common/chip.js";

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
    <Chip
      label={label}
      onRemove={onRemove ? handleRemove : undefined}
      removeAriaLabel={`Remove tag ${label}`}
      className={cn("font-mono text-accent", className)}
    />
  );
}
