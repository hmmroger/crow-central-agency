import { useCallback, useState } from "react";

interface AgentCardInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
}

/**
 * Compact quick-send input for dashboard agent cards.
 */
export function AgentCardInput({ onSend, isStreaming }: AgentCardInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    onSend(trimmed);
    setText("");
  }, [text, onSend]);

  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={isStreaming ? "Inject..." : "Send..."}
        className="flex-1 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
      />
      <button
        type="button"
        className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-30"
        onClick={handleSubmit}
        disabled={!text.trim()}
      >
        Send
      </button>
    </div>
  );
}
