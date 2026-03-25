import { useCallback, useState } from "react";
import { Send, Square } from "lucide-react";

interface MessageInputProps {
  /** Called with trimmed text when user submits while not streaming */
  onSend: (text: string) => void;
  /** Called with trimmed text when user submits during streaming (inject) */
  onInject: (text: string) => void;
  /** Called when user clicks the Stop button */
  onAbort: () => void;
  /** Whether the agent is currently streaming */
  isStreaming: boolean;
  /** Disable the input */
  disabled?: boolean;
  /**
   * Layout variant:
   * - "full": multi-line textarea with backdrop blur, centered max-width, hint text (console)
   * - "compact": single-line input, minimal padding, no hint (dashboard card)
   */
  variant?: "full" | "compact";
}

/**
 * Unified message input with send/inject/stop behaviour.
 * Used by both the full agent console and the dashboard agent card.
 */
export function MessageInput({
  onSend,
  onInject,
  onAbort,
  isStreaming,
  disabled,
  variant = "full",
}: MessageInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    if (isStreaming) {
      onInject(trimmed);
    } else {
      onSend(trimmed);
    }

    setText("");
  }, [text, isStreaming, onSend, onInject]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const placeholder = isStreaming ? "Inject a message..." : "Send a message...";

  if (variant === "compact") {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
        {isStreaming ? (
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-error/15 text-error text-xs font-medium hover:bg-error/25 transition-colors disabled:opacity-30"
            onClick={onAbort}
            disabled={disabled}
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-30"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pb-5 pt-2 shrink-0">
      <div className="max-w-3xl mx-auto flex gap-2 items-end bg-surface/70 backdrop-blur-md border border-border-subtle rounded-lg p-2 focus-within:border-border-focus">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent px-2 py-2 text-text-primary text-sm font-mono resize-none outline-none placeholder:text-text-muted"
        />

        {isStreaming ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 bg-error/15 hover:bg-error/25 text-error transition-colors disabled:opacity-30"
            onClick={onAbort}
            disabled={disabled}
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-xs font-semibold shrink-0 bg-primary text-text-primary hover:opacity-90 disabled:opacity-20 transition-opacity"
            onClick={handleSubmit}
            disabled={disabled || !text.trim()}
          >
            Send
          </button>
        )}
      </div>
      <p className="max-w-3xl mx-auto text-2xs text-text-muted/60 mt-1.5 text-center font-mono">
        Enter to send &middot; Shift+Enter for new line
      </p>
    </div>
  );
}
