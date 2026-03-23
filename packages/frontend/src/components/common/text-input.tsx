import type { InputHTMLAttributes } from "react";

/**
 * Styled text input — used across agent config, dashboard filter, etc.
 * Single style, no variants.
 */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      {...props}
      className={`w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus ${props.className ?? ""}`}
    />
  );
}
