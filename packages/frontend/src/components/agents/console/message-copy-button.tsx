import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";

interface MessageCopyButtonProps {
  message: AgentMessage;
}

const COPIED_FEEDBACK_MS = 1500;

function isApplicable(message: AgentMessage): boolean {
  return message.type === AGENT_MESSAGE_TYPE.TEXT;
}

/**
 * Compact copy-to-clipboard button rendered next to a message.
 * Self-gates to text messages and briefly swaps in a check icon after copying.
 * Sets `data-active="true"` while showing feedback so the actions row stays
 * visible even if the pointer leaves the message group.
 */
export function MessageCopyButton({ message }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      })
      .catch(() => {
        // Clipboard unavailable — silently ignore.
      });
  }, [message.content]);

  if (!isApplicable(message)) {
    return null;
  }

  const ariaLabel = copied ? "Copied to clipboard" : "Copy message";

  return (
    <button
      type="button"
      onClick={handleClick}
      data-active={copied ? "true" : undefined}
      className="inline-flex items-center justify-center h-5 w-5 rounded border border-border-subtle text-3xs text-text-muted hover:text-text-neutral hover:bg-surface-elevated/50 transition-colors"
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {copied ? <Check className="h-3 w-3 text-primary/50" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
