import { AGENT_MESSAGE_ROLE, type AgentMessage } from "@crow-central-agency/shared";
import type { ActiveToolUse } from "../../hooks/use-agent-interaction.types.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

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

  if (recentMessages.length === 0 && !streamingText) {
    return <div className="flex-1 min-h-0 flex items-center text-xs text-text-muted italic">No messages yet</div>;
  }

  const containerClass = `${expanded ? "space-y-1" : "space-y-0.5"} text-xs flex-1 min-h-0 overflow-y-auto`;
  const messageClass = expanded ? "" : "line-clamp-2";

  return (
    <div className={containerClass}>
      {recentMessages.map((message) => (
        <div key={message.id} className={`overflow-hidden ${messageClass}`}>
          {message.role === AGENT_MESSAGE_ROLE.USER && <MarkdownRenderer content={`**You:** ${message.content}`} />}
          {message.role === AGENT_MESSAGE_ROLE.AGENT && <MarkdownRenderer content={message.content} />}
          {message.role === AGENT_MESSAGE_ROLE.SYSTEM && (
            <span className="text-text-muted">
              <span className="font-mono">{message.toolName}</span> {message.content}
            </span>
          )}
        </div>
      ))}

      {streamingText && (
        <div className="animate-pulse">
          <MarkdownRenderer content={streamingText} />
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
