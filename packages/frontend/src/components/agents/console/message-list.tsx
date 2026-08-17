import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../../hooks/queries/use-agent-stream-state.types.js";
import { useStickToBottom } from "../../../hooks/use-stick-to-bottom.js";
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

const OVERSCAN = 8;

/** Gap between rows in pixels — must match the previous `space-y-3` (0.75rem) */
const ROW_GAP = 12;

/** ActivityItem row height (activity-item.tsx: text-xs + py-1) */
const ROW_HEIGHT_TOOL_USE = 24;

/** CommandItem row height (command-item.tsx: outer py-1 + inner text-3xs pill py-0.5) */
const ROW_HEIGHT_COMMAND = 26;

/** ThinkingMessage collapsed row height (thinking-message.tsx: text-xs button + py-1) */
const ROW_HEIGHT_THINKING_COLLAPSED = 24;

/** Line height for TEXT bubbles (text-sm leading-relaxed ≈ 0.875rem × 1.625) */
const TEXT_LINE_HEIGHT_PX = 23;

/** MessageActions row below every TEXT bubble (message-actions.tsx: single icon-button row) */
const MESSAGE_ACTIONS_HEIGHT_PX = 24;

/** Approx characters per wrapped line in a USER bubble (max-w-bubble = 75% of max-w-3xl, minus px-3) */
const USER_TEXT_CHARS_PER_LINE = 75;

/** Approx characters per wrapped line in an AGENT bubble (full max-w-3xl, minus px-3) */
const AGENT_TEXT_CHARS_PER_LINE = 105;

function estimateMessageHeight(message: AgentMessage): number {
  switch (message.type) {
    case AGENT_MESSAGE_TYPE.TOOL_USE:
      return ROW_HEIGHT_TOOL_USE;
    case AGENT_MESSAGE_TYPE.COMMAND:
      return ROW_HEIGHT_COMMAND;
    case AGENT_MESSAGE_TYPE.THINKING:
      return ROW_HEIGHT_THINKING_COLLAPSED;
    case AGENT_MESSAGE_TYPE.TEXT: {
      const charsPerLine =
        message.role === AGENT_MESSAGE_ROLE.USER ? USER_TEXT_CHARS_PER_LINE : AGENT_TEXT_CHARS_PER_LINE;
      const lines = Math.max(1, Math.ceil(message.content.length / charsPerLine));
      return lines * TEXT_LINE_HEIGHT_PX + MESSAGE_ACTIONS_HEIGHT_PX;
    }
  }
}

export function MessageList({ agentId, messages, streamingText, isStreaming, activeToolUse }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualList({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index]),
    overscan: OVERSCAN,
    gap: ROW_GAP,
    getItemKey: (index) => messages[index].id,
  });

  const { scheduleScrollIfPinned, isSettled } = useStickToBottom({ scrollRef, contentRef });

  useEffect(() => {
    scheduleScrollIfPinned();
  }, [messages.length, streamingText, activeToolUse?.toolName, scheduleScrollIfPinned]);

  const virtualRows = virtualizer.getVirtualItems();
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div ref={scrollRef} tabIndex={-1} className="flex-1 overflow-y-auto px-5 py-5 focus:outline-none">
      <div
        ref={contentRef}
        className={`max-w-3xl mx-auto min-h-full flex flex-col transition-opacity duration-fast ${
          isSettled ? "opacity-100" : "opacity-0"
        }`}
      >
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Terminal size={20} className="text-accent" />
            </div>
            <p className="text-text-muted text-sm">Send a message to start the conversation.</p>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
