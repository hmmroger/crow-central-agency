import { AGENT_MESSAGE_ROLE, type AgentMessage } from "@crow-central-agency/shared";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { ActivityItem } from "./activity-item.js";

interface AgentMessageProps {
  message: AgentMessage;
}

/**
 * Renders a single committed message in the agent console by role.
 */
export function AgentMessageView({ message }: AgentMessageProps) {
  switch (message.role) {
    case AGENT_MESSAGE_ROLE.USER:
      return (
        <div className="px-4 py-2 bg-surface-alt">
          <MarkdownRenderer content={`**You:** ${message.content}`} />
        </div>
      );

    case AGENT_MESSAGE_ROLE.AGENT:
      return (
        <div className="px-4 py-2">
          <MarkdownRenderer content={message.content} />
        </div>
      );

    case AGENT_MESSAGE_ROLE.SYSTEM:
      return <ActivityItem toolName={message.toolName ?? ""} content={message.content} />;

    default:
      return null;
  }
}
