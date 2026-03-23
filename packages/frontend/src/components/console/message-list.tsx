import type { AgentMessage } from "../../hooks/use-agent-interaction.types.js";
import { useAutoScroll } from "../../hooks/use-auto-scroll.js";
import { AgentMessageView } from "./agent-message.js";
import { MarkdownRenderer } from "./markdown-renderer.js";
import { StreamingIndicator } from "./streaming-indicator.js";

interface MessageListProps {
  messages: AgentMessage[];
  streamingText: string;
  isStreaming: boolean;
}

/**
 * Scrollable message area for the agent console.
 * Auto-scrolls to bottom on new messages.
 */
export function MessageList({ messages, streamingText, isStreaming }: MessageListProps) {
  const scrollRef = useAutoScroll(`${messages.length}-${streamingText.length}`);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      {messages.length === 0 && !isStreaming && (
        <div className="h-full flex items-center justify-center text-text-muted text-sm">
          Send a message to start the conversation
        </div>
      )}

      {messages.map((message) => (
        <AgentMessageView key={message.id} message={message} />
      ))}

      {streamingText && (
        <div className="px-4 py-2">
          <MarkdownRenderer content={streamingText} />
        </div>
      )}

      {isStreaming && !streamingText && <StreamingIndicator />}
    </div>
  );
}
