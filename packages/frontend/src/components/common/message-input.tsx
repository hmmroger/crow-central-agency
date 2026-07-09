import { useCallback, useLayoutEffect, useRef } from "react";
import { Send, Square } from "lucide-react";
import { useInputHistoryNavigation } from "./use-input-history-navigation.js";

interface MessageInputProps {
  /** Current compose text (controlled by the parent, sourced from the draft store) */
  value: string;
  /** Called whenever the compose text changes (typing, recall, submit clear, Esc) */
  onChange: (text: string) => void;
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
  value,
  onChange,
  onSend,
  onInject,
  onAbort,
  isStreaming,
  disabled,
  history = [],
  variant = "full",
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Holds the text wiped by an Esc-clear so a follow-up Esc can restore it (one-level undo).
  // Component-local and non-persisted: an immediate in-session affordance only.
  const clearedStashRef = useRef<string>("");
  const {
    handleArrowKey,
    reset: resetHistoryNavigation,
    exitRecall,
  } = useInputHistoryNavigation({
    history,
    setText: onChange,
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

  // Resize on every text change, including programmatic ones (Up/Down recall, submit clear).
  // No-op for the compact variant, whose input never attaches textareaRef.
  useLayoutEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(event.target.value);
      resetHistoryNavigation();
    },
    [onChange, resetHistoryNavigation]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    if (isStreaming) {
      onInject(trimmed);
    } else {
      onSend(trimmed);
    }

    onChange("");
    clearedStashRef.current = "";
    resetHistoryNavigation();
  }, [value, isStreaming, onSend, onInject, onChange, resetHistoryNavigation]);

  const handleEscape = useCallback(() => {
    // 1. In history recall → cancel recall, restore the live draft.
    if (exitRecall()) {
      return;
    }

    // 2. Non-empty live draft → clear the whole input, stashing the cleared text.
    if (value) {
      clearedStashRef.current = value;
      onChange("");
      return;
    }

    // 3. Empty input with a stash → restore it (one-level undo).
    if (clearedStashRef.current) {
      onChange(clearedStashRef.current);
      clearedStashRef.current = "";
    }
  }, [exitRecall, value, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleEscape();
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        handleArrowKey(event);
      }
    },
    [handleSubmit, handleEscape, handleArrowKey]
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
      disabled={disabled || !value.trim()}
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
          value={value}
          onChange={handleChange}
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
          value={value}
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
        Enter to send &middot; Shift+Enter for new line &middot; Up/Down to recall &middot; Esc to clear
      </p>
    </div>
  );
}
