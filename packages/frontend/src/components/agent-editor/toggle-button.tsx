import { cn } from "../../utils/cn.js";

interface ToggleButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

/** Toggle button for mutually exclusive mode selection */
export function ToggleButton({ active, onClick, label }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
        active
          ? "bg-primary/20 text-primary border-primary/30"
          : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-secondary"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
