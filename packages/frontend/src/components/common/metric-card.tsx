import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn.js";

interface MetricCardProps {
  /** Icon rendered in the accent-colored circle */
  icon: ComponentType<{ className?: string }>;
  /** Metric label (e.g. "Active") */
  label: string;
  /** Numeric value to display */
  value: number;
  /** Tailwind text color class for the icon and value accent (e.g. "text-primary") */
  accentClass?: string;
  /** Matching background tint for the icon circle (e.g. "bg-primary/10") */
  accentBgClass?: string;
  /** Animation stagger index — controls entrance delay */
  index?: number;
  /** Optional click handler */
  onClick?: () => void;
  className?: string;
}

/**
 * Compact metric card with icon badge, animated value, and subtle depth.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  accentClass = "text-primary",
  accentBgClass = "bg-primary/10",
  index = 0,
  onClick,
  className,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "group relative flex items-center gap-3 px-1.5 py-2 w-32 rounded-lg bg-surface border border-border-subtle/60 overflow-hidden transition-colors duration-200 hover:border-border/80",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Subtle top-edge highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-border/50 to-transparent" />

      {/* Icon badge */}
      <div className={cn("flex items-center justify-center w-8 h-8 rounded-md shrink-0", accentBgClass)}>
        <Icon className={cn("w-4 h-4", accentClass)} />
      </div>

      {/* Value + label */}
      <div className="flex flex-col min-w-0">
        <span className={cn("text-lg font-semibold font-mono tabular-nums leading-tight", accentClass)}>{value}</span>
        <span className="text-2xs text-text-muted leading-tight truncate">{label}</span>
      </div>
    </motion.div>
  );
}
