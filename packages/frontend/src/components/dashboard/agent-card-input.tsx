import { useCallback, useState } from "react";
import { Send } from "lucide-react";

interface AgentCardInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
}

/**
 * Quick-send input for dashboard agent cards.
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
    <div className="flex gap-2">
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
        placeholder={isStreaming ? "Inject message..." : "Send message..."}
        className="flex-1 px-3 py-1.5 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-xs placeholder:text-text-muted focus:outline-none focus:border-border-focus"
      />
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-30"
        onClick={handleSubmit}
        disabled={!text.trim()}
      >
        <Send className="h-3.5 w-3.5" />
        Send
      </button>
    </div>
  );
}
