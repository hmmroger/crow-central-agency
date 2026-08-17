import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../../hooks/queries/use-agent-stream-state.types.js";
import { useVirtualList } from "../../../hooks/use-virtual-list.js";
import { AgentMessageView } from "./agent-message.js";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";
import { StreamingIndicator } from "./streaming-indicator.js";

interface MessageListProps {
  agentId: string;
  messages: AgentMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeToolUse?: ActiveToolUse;
}

const ESTIMATED_ROW_HEIGHT = 120;

const OVERSCAN = 4;

/** Gap between rows in pixels — must match the previous `space-y-3` (0.75rem) */
const ROW_GAP = 12;

export function MessageList({ agentId, messages, streamingText, isStreaming, activeToolUse }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualList({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    gap: ROW_GAP,
    getItemKey: (index) => messages[index].id,
  });

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, virtualizer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [streamingText.length, activeToolUse?.toolName]);

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

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
      <div className="max-w-3xl mx-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualRows.map((virtualRow) => {
            const message = messages[virtualRow.index];

            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <AgentMessageView agentId={agentId} message={message} />
              </div>
            );
          })}
        </div>

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
