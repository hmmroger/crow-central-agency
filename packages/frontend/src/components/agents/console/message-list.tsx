import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../../hooks/queries/use-agent-stream-state.types.js";
import { AgentMessageView } from "./agent-message.js";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";
import { StreamingIndicator } from "./streaming-indicator.js";

interface MessageListProps {
  messages: AgentMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeToolUse?: ActiveToolUse;
}

/**
 * Scrollable message area for the agent console.
 * Centered chat layout with auto-scroll to bottom.
 */
export function MessageList({ messages, streamingText, isStreaming, activeToolUse }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length, streamingText.length, activeToolUse?.toolName]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <Terminal size={20} className="text-accent" />
        </div>
        <p className="text-text-muted text-sm">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      <div className="max-w-3xl mx-auto space-y-3">
        {messages.map((message) => (
          <AgentMessageView key={message.id} message={message} />
        ))}

        {streamingText && (
          <div className="bg-surface-elevated/40 border border-border-subtle rounded-lg px-4 py-3">
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

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
