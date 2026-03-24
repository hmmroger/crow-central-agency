import { useCallback, useState } from "react";
import { Square } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  onInject: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

/**
 * Chat input bar — centered, rounded container with send/stop button.
 * During streaming, input injects a message; stop button aborts.
 */
export function MessageInput({ onSend, onInject, onAbort, isStreaming, disabled }: MessageInputProps) {
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

  return (
    <div className="px-5 pb-5 pt-2 shrink-0">
      <div className="max-w-3xl mx-auto flex gap-2 items-end bg-surface/70 backdrop-blur-md border border-border-subtle rounded-lg p-2 focus-within:border-border-focus">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Inject a message..." : "Send a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent px-2 py-2 text-text-primary text-sm font-mono resize-none outline-none placeholder:text-text-muted"
        />

        {isStreaming ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold shrink-0 bg-error/15 hover:bg-error/25 text-error transition-colors"
            onClick={onAbort}
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
