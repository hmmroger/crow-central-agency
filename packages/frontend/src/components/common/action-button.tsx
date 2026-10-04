import type { ComponentType } from "react";
import { cn } from "../../utils/cn.js";

export const ACTION_BUTTON_VARIANT = {
  PRIMARY: "primary",
  PRIMARY_SOLID: "primary-solid",
  SECONDARY: "secondary",
  DESTRUCTIVE: "destructive",
  /** Compact and borderless, for controls that sit inside a list or a panel header */
  GHOST: "ghost",
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
  /** Set on toggle controls to surface the on/off state visually and via `aria-pressed` */
  isActive?: boolean;
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
  [ACTION_BUTTON_VARIANT.GHOST]: "border-transparent text-text-muted hover:text-text-base hover:bg-surface-elevated",
};

const DEFAULT_VARIANT_CLASSES = "text-text-muted border-border/75 hover:text-text-neutral";

const ICON_ONLY_CLASSES =
  "flex items-center justify-center w-7.5 h-7.5 rounded-md border transition-colors disabled:opacity-40";
const LABELED_CLASSES =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-40";
const GHOST_ICON_ONLY_CLASSES =
  "flex items-center justify-center p-1 rounded border transition-colors disabled:opacity-40 disabled:pointer-events-none";
const GHOST_LABELED_CLASSES =
  "flex items-center gap-1 px-1.5 py-1 rounded border text-xs transition-colors disabled:opacity-40 disabled:pointer-events-none";
const ICON_CLASSES = "h-4 w-4";
const GHOST_ICON_CLASSES = "h-3.5 w-3.5";

const ACTIVE_CLASSES = "bg-primary/20 text-primary border-primary/40";

/**
 * Tinted action button with primary/secondary/destructive variants, a compact borderless ghost variant, or the default
 * outlined treatment when no variant is set.
 * Defaults to a labeled pill; `iconOnly` switches to a compact square with the label surfaced via tooltip.
 */
export function ActionButton({
  icon: Icon,
  label,
  variant,
  iconOnly = false,
  isActive,
  disabled = false,
  type = "button",
  onClick,
  className,
}: ActionButtonProps) {
  const isGhost = variant === ACTION_BUTTON_VARIANT.GHOST;
  const iconOnlyClasses = isGhost ? GHOST_ICON_ONLY_CLASSES : ICON_ONLY_CLASSES;
  const labeledClasses = isGhost ? GHOST_LABELED_CLASSES : LABELED_CLASSES;
  const variantClasses = variant ? VARIANT_CLASSES[variant] : DEFAULT_VARIANT_CLASSES;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      aria-pressed={isActive}
      className={cn(iconOnly ? iconOnlyClasses : labeledClasses, variantClasses, isActive && ACTIVE_CLASSES, className)}
    >
      {Icon && <Icon className={isGhost ? GHOST_ICON_CLASSES : ICON_CLASSES} />}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
