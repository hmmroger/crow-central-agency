import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

/**
 * Primary action button — used for create, save, send, etc.
 * Single style, no variants.
 */
export function PrimaryButton({ children, className, ...props }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-text-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
