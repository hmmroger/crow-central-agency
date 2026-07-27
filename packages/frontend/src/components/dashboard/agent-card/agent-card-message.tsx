import { memo } from "react";
import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import { Zap } from "lucide-react";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";

interface AgentCardMessageProps {
  message: AgentMessage;
}

/**
 * Renders a single message in a dashboard agent card transcript by role.
 * Compact styling variant of the console's AgentMessageView.
 */
export const AgentCardMessage = memo(({ message }: AgentCardMessageProps) => {
  if (message.role === AGENT_MESSAGE_ROLE.USER) {
    return (
      <div className="text-xs font-sans leading-relaxed">
        <span className="text-accent">{"> "}</span>
        <span className="text-text-neutral">
          <span>{message.content}</span>
        </span>
      </div>
    );
  }

  if (message.role === AGENT_MESSAGE_ROLE.AGENT) {
    if (message.type === AGENT_MESSAGE_TYPE.THINKING) {
      return (
        <div className="flex items-center gap-1 text-xs font-mono leading-relaxed text-text-muted">
          <Zap className="h-3 w-3 text-secondary-muted" />
          <span className="italic">Thinking...</span>
        </div>
      );
    }

    return <MarkdownRenderer content={message.content} className="text-xs text-text-neutral" />;
  }

  if (message.role === AGENT_MESSAGE_ROLE.SYSTEM) {
    if (message.type === AGENT_MESSAGE_TYPE.TOOL_USE) {
      return (
        <div className="text-xs font-mono leading-relaxed">
          <span className="text-text-muted/60">{"~ "}</span>
          <span className="text-text-muted">
            <span>{message.toolName}</span> {message.content}
          </span>
        </div>
      );
    }

    if (message.type === AGENT_MESSAGE_TYPE.COMMAND) {
      return (
        <div className="text-2xs font-mono leading-relaxed text-text-muted">
          <span className="text-secondary-muted">{"& "}</span>
          <span className="italic">{message.content}</span>
        </div>
      );
    }
  }

  return null;
});
