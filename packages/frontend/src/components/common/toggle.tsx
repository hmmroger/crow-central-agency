import { cn } from "../../utils/cn.js";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  name?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Modern pill-style toggle switch. Drop-in replacement for a binary checkbox.
 * Backed by a native `<input type="checkbox" role="switch">` for form
 * integration, keyboard navigation, and screen-reader support.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  variant = "primary",
  name,
  id,
  ariaLabel,
  className,
}: ToggleProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className
      )}
    >
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          name={name}
          id={id}
          aria-label={ariaLabel}
        />
        <span
          className={cn(
            "block h-4 w-7 rounded-full border border-border-subtle bg-surface-inset transition-colors peer-focus-visible:ring-2",
            variant === "secondary"
              ? "peer-checked:border-secondary peer-checked:bg-secondary peer-focus-visible:ring-secondary/40"
              : "peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-primary/40"
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-text-base shadow-sm transition-transform",
            "peer-checked:translate-x-3"
          )}
        />
      </span>
      {label && <span className="text-xs text-text-neutral">{label}</span>}
    </label>
  );
}
