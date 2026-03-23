import type { TextareaHTMLAttributes } from "react";

/**
 * Styled textarea — used for persona, message input, etc.
 * Single style, no variants.
 */
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y ${props.className ?? ""}`}
    />
  );
}
