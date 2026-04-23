import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../../utils/cn.js";

interface DashboardWidgetProps {
  title: string;
  /** Optional count or badge displayed after the title */
  badge?: ReactNode;
  /** Optional action element in the header (e.g. expand button) */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Common card wrapper for dashboard widgets.
 * Provides consistent surface, header layout, and entrance animation.
 */
export function DashboardWidget({ title, badge, action, className, children }: DashboardWidgetProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("bg-neutral h-full rounded-lg p-4 overflow-hidden", className)}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xs font-medium uppercase tracking-widest text-text-muted">
          {title}
          {badge !== undefined && <span className="ml-1.5 text-text-muted/60">{badge}</span>}
        </h3>
        {action}
      </div>
      {children}
    </motion.section>
  );
}
