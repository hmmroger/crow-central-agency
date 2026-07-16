import { useMemo } from "react";
import type { AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../../hooks/queries/use-agent-stream-state.types.js";
import { useAutoScroll } from "../../../hooks/use-auto-scroll.js";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";
import { AgentCardMessage } from "./agent-card-message.js";

interface AgentCardMessagesProps {
  messages: AgentMessage[];
  streamingText: string;
  expanded: boolean;
  activeToolUse?: ActiveToolUse;
  maxMessages?: number;
}

const COLLAPSED_MAX_MESSAGES = 5;
const EXPANDED_MAX_MESSAGES = 20;

/**
 * Message transcript for dashboard agent cards.
 * Collapsed: constrained height with line-clamp.
 * Expanded: taller area, no truncation.
 */
export function AgentCardMessages({
  messages,
  streamingText,
  expanded,
  activeToolUse,
  maxMessages,
}: AgentCardMessagesProps) {
  const limit = maxMessages ?? (expanded ? EXPANDED_MAX_MESSAGES : COLLAPSED_MAX_MESSAGES);
  const recentMessages = messages.slice(-limit);
  const scrollRef = useAutoScroll(
    `${expanded}-${messages.length}-${streamingText.length}-${activeToolUse?.toolName ?? ""}`
  );

  const heightStyle = {
    height: expanded ? "24rem" : "10rem",
    transition: "height var(--duration-normal) var(--ease-in-out)",
  };

  const agentMessages = useMemo(() => {
    return recentMessages.map((message) => <AgentCardMessage key={message.id} message={message} />);
  }, [recentMessages]);

  if (recentMessages.length === 0 && !streamingText) {
    return (
      <div
        style={heightStyle}
        className={`${expanded ? "space-y-1" : "space-y-0.5"} text-xs shrink-0 min-h-0 flex items-center justify-center text-text-muted italic`}
      >
        No messages yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      style={heightStyle}
      className={`${expanded ? "space-y-1 overflow-y-auto" : "space-y-0.5 overflow-hidden flex flex-col justify-end"} text-xs shrink-0 overflow-x-hidden px-2.5 py-2`}
    >
      {agentMessages}

      {streamingText && (
        <div className="animate-pulse">
          <MarkdownRenderer content={streamingText} className="text-xs" isStreaming={true} />
        </div>
      )}

      {activeToolUse && (
        <div className="flex items-center gap-1 text-text-muted animate-pulse">
          <span className="font-mono">{activeToolUse.toolName}</span>
          {activeToolUse.elapsedTimeSeconds !== undefined && (
            <span className="tabular-nums">({Math.round(activeToolUse.elapsedTimeSeconds)}s)</span>
          )}
        </div>
      )}
    </div>
  );
}
