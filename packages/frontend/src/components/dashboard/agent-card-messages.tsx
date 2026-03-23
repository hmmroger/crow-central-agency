import { AGENT_MESSAGE_KIND, type AgentMessage } from "../../hooks/use-agent-interaction.types.js";
import { MarkdownRenderer } from "../common/markdown-renderer.js";

interface AgentCardMessagesProps {
  messages: AgentMessage[];
  streamingText: string;
  maxMessages?: number;
}

const DEFAULT_MAX_MESSAGES = 5;

/**
 * Compact transcript showing the last N messages in the dashboard card.
 */
export function AgentCardMessages({
  messages,
  streamingText,
  maxMessages = DEFAULT_MAX_MESSAGES,
}: AgentCardMessagesProps) {
  const recentMessages = messages.slice(-maxMessages);

  if (recentMessages.length === 0 && !streamingText) {
    return <div className="text-xs text-text-muted italic py-1">No messages yet</div>;
  }

  return (
    <div className="space-y-0.5 text-xs max-h-24 overflow-y-auto">
      {recentMessages.map((message) => (
        <div key={message.id} className="truncate">
          {message.kind === AGENT_MESSAGE_KIND.TEXT && <MarkdownRenderer content={message.text ?? ""} />}
          {message.kind === AGENT_MESSAGE_KIND.ACTIVITY && (
            <span className="text-text-muted">
              <span className="font-mono">{message.toolName}</span> {message.description}
            </span>
          )}
          {message.kind === AGENT_MESSAGE_KIND.RESULT && (
            <span className={message.subtype === "success" ? "text-success" : "text-error"}>
              {message.subtype === "success" ? "Completed" : message.subtype}
            </span>
          )}
        </div>
      ))}

      {streamingText && (
        <div className="animate-pulse">
          <MarkdownRenderer content={streamingText} />
        </div>
      )}
    </div>
  );
}
