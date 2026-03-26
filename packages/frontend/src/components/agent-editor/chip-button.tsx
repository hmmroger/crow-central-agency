import { cn } from "../../utils/cn.js";

interface ChipButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

/** Chip button for toggling items in a selection list */
export function ChipButton({ label, active, onClick }: ChipButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "px-2 py-1 rounded text-xs font-mono transition-colors border",
        active
          ? "bg-primary/15 text-primary border-primary/25"
          : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-secondary"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
