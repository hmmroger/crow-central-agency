import { useCallback, useState } from "react";
import { Send, Square } from "lucide-react";

interface MessageInputProps {
  onSend: (text: string) => void;
  onInject: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

/**
 * Input box with send/stop buttons for the agent console.
 * Enter sends, Shift+Enter for newlines.
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
    <div className="flex gap-2 p-4 border-t border-border-subtle">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? "Inject a message..." : "Send a message..."}
        disabled={disabled}
        rows={1}
        className="flex-1 px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-none"
      />

      {isStreaming ? (
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-error/20 text-error text-sm font-medium hover:bg-error/30 transition-colors"
          onClick={onAbort}
        >
          <Square size={14} />
          Stop
        </button>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-text-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
        >
          <Send size={14} />
          Send
        </button>
      )}
    </div>
  );
}
