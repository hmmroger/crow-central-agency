import { useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../../utils/cn.js";

interface CopyButtonProps {
  /** Text content to copy to the clipboard */
  text: string;
  /** Optional extra classes applied to the button */
  className?: string;
  /** Duration in ms to show the "Copied!" feedback */
  feedbackDurationMs?: number;
}

const DEFAULT_FEEDBACK_DURATION_MS = 2000;

/**
 * Small button that copies the provided text to the clipboard and briefly
 * shows a "Copied!" confirmation state.
 */
export function CopyButton({ text, className, feedbackDurationMs = DEFAULT_FEEDBACK_DURATION_MS }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), feedbackDurationMs);
      })
      .catch(() => {
        // Clipboard unavailable — silently ignore
      });
  }, [text, feedbackDurationMs]);

  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors",
        copied
          ? "text-success bg-success/10 border-success/30"
          : "text-text-muted border-border-subtle hover:text-text-base hover:bg-surface-hover",
        className
      )}
      onClick={handleCopy}
      aria-label={copied ? "Copied to clipboard" : "Copy content to clipboard"}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
