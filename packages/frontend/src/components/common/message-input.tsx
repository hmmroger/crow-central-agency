import { useCallback, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { useInputHistoryNavigation } from "./use-input-history-navigation.js";

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
  /** Previously submitted inputs (oldest first) for Up/Down recall */
  history?: string[];
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
  history = [],
  variant = "full",
}: MessageInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { handleArrowKey, reset: resetHistoryNavigation } = useInputHistoryNavigation({
    history,
    setText,
    multiline: variant === "full",
  });

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
      resetHistoryNavigation();
      autoResize();
    },
    [autoResize, resetHistoryNavigation]
  );

  const handleCompactChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setText(event.target.value);
      resetHistoryNavigation();
    },
    [resetHistoryNavigation]
  );

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
    resetHistoryNavigation();
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
    }
  }, [text, isStreaming, onSend, onInject, resetHistoryNavigation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        handleArrowKey(event);
      }
    },
    [handleSubmit, handleArrowKey]
  );

  const placeholder = isStreaming ? "Inject a message..." : "Send a message...";
  const action = isStreaming ? (
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
      <Send className="h-3 w-3" />
      Send
    </button>
  );

  if (variant === "compact") {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={handleCompactChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-2 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-base text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
        {action}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 shrink-0">
      <div className="max-w-3xl mx-auto flex gap-2 items-center bg-surface/70 backdrop-blur-md border border-border-subtle rounded-lg px-2 py-1.5 focus-within:border-border-focus">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent px-2 py-2 text-text-base text-sm font-mono resize-none outline-none placeholder:text-text-muted max-h-40 overflow-y-auto"
        />
        {action}
      </div>
      <p className="max-w-3xl mx-auto text-2xs text-text-muted/60 mt-1.5 text-center font-mono">
        Enter to send &middot; Shift+Enter for new line &middot; Up/Down to recall
      </p>
    </div>
  );
}
