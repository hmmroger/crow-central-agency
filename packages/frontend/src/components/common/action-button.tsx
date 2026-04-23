import type { ComponentType } from "react";
import { cn } from "../../utils/cn.js";

export const ACTION_BUTTON_VARIANT = {
  PRIMARY: "primary",
  PRIMARY_SOLID: "primary-solid",
  SECONDARY: "secondary",
  DESTRUCTIVE: "destructive",
} as const;

export type ActionButtonVariant = (typeof ACTION_BUTTON_VARIANT)[keyof typeof ACTION_BUTTON_VARIANT];

export type ActionButtonType = "button" | "submit";

interface ActionButtonProps {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  /** Omit for the default outlined treatment */
  variant?: ActionButtonVariant;
  /** When true, renders an icon-only square button with the label as tooltip/aria-label */
  iconOnly?: boolean;
  disabled?: boolean;
  type?: ActionButtonType;
  onClick?: () => void;
  className?: string;
}

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  [ACTION_BUTTON_VARIANT.PRIMARY]: "bg-primary/15 text-primary border-primary/25 hover:bg-primary/25",
  [ACTION_BUTTON_VARIANT.PRIMARY_SOLID]: "bg-primary text-text-primary border-primary hover:opacity-90",
  [ACTION_BUTTON_VARIANT.SECONDARY]: "bg-secondary/15 text-secondary border-secondary/25 hover:bg-secondary/25",
  [ACTION_BUTTON_VARIANT.DESTRUCTIVE]: "bg-error/15 text-error border-error/25 hover:bg-error/25",
};

const DEFAULT_VARIANT_CLASSES = "text-text-muted border-border/75 hover:text-text-neutral";

/**
 * Tinted action button with primary/secondary/destructive variants, or the default outlined treatment when no variant is set.
 * Defaults to a labeled pill; `iconOnly` switches to a compact square with the label surfaced via tooltip.
 */
export function ActionButton({
  icon: Icon,
  label,
  variant,
  iconOnly = false,
  disabled = false,
  type = "button",
  onClick,
  className,
}: ActionButtonProps) {
  const iconOnlyClasses =
    "flex items-center justify-center w-7.5 h-7.5 rounded-md border transition-colors disabled:opacity-40";
  const labeledClasses =
    "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-40";
  const variantClasses = variant ? VARIANT_CLASSES[variant] : DEFAULT_VARIANT_CLASSES;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={cn(iconOnly ? iconOnlyClasses : labeledClasses, variantClasses, className)}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
