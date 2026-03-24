import type { AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../hooks/use-agent-interaction.types.js";
import { useAutoScroll } from "../../hooks/use-auto-scroll.js";
import { AgentMessageView } from "./agent-message.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { StreamingIndicator } from "./streaming-indicator.js";

interface MessageListProps {
  messages: AgentMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeToolUse?: ActiveToolUse;
}

/**
 * Scrollable message area for the agent console.
 * Shows committed messages, streaming text, and active tool indicator.
 * Auto-scrolls to bottom on new messages.
 */
export function MessageList({ messages, streamingText, isStreaming, activeToolUse }: MessageListProps) {
  const scrollRef = useAutoScroll(`${messages.length}-${streamingText.length}-${activeToolUse?.toolName ?? ""}`);

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
          <MarkdownRenderer content={streamingText} isStreaming={true} />
        </div>
      )}

      {activeToolUse && (
        <div className="flex items-center gap-2 px-3 py-1 text-xs text-text-muted">
          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="font-mono">{activeToolUse.toolName}</span>
          <span className="truncate">{activeToolUse.description}</span>
          {activeToolUse.elapsedTimeSeconds !== undefined && (
            <span className="shrink-0 tabular-nums">{Math.round(activeToolUse.elapsedTimeSeconds)}s</span>
          )}
        </div>
      )}

      {isStreaming && !streamingText && !activeToolUse && <StreamingIndicator />}
    </div>
  );
}
