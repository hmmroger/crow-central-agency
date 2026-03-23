import type { ButtonHTMLAttributes, ReactNode } from "react";

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * Ghost/subtle action button — used for compact, new session, back, etc.
 * Single style, no variants.
 */
export function GhostButton({ children, className, ...props }: GhostButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-30 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
