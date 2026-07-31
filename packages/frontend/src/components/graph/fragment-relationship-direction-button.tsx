import { useCallback } from "react";
import type { RelationshipDirection } from "@crow-central-agency/shared";
import { cn } from "../../utils/cn.js";

interface FragmentRelationshipDirectionButtonProps {
  direction: RelationshipDirection;
  label: string;
  isSelected: boolean;
  isDisabled: boolean;
  disabledReason?: string;
  onSelect: (direction: RelationshipDirection) => void;
}

/** One option of the add-flow direction selector; binds its own value so the parent handler stays stable. */
export function FragmentRelationshipDirectionButton({
  direction,
  label,
  isSelected,
  isDisabled,
  disabledReason,
  onSelect,
}: FragmentRelationshipDirectionButtonProps) {
  const handleSelect = useCallback(() => onSelect(direction), [onSelect, direction]);

  return (
    <button
      type="button"
      disabled={isDisabled}
      title={isDisabled ? disabledReason : undefined}
      onClick={handleSelect}
      className={cn(
        "rounded-md border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
        isSelected
          ? "border-primary/25 bg-primary/15 text-primary"
          : "border-border/75 text-text-muted hover:text-text-neutral"
      )}
    >
      {label}
    </button>
  );
}
