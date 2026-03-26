import { AGENT_MESSAGE_ROLE, type AgentMessage } from "@crow-central-agency/shared";
import { MarkdownRenderer } from "../common/markdown-renderer.js";
import { ActivityItem } from "./activity-item.js";

interface AgentMessageProps {
  message: AgentMessage;
}

/**
 * Renders a single committed message in the agent console by role.
 * User messages are right-aligned bubbles, agent messages are left-aligned bubbles.
 */
export function AgentMessageView({ message }: AgentMessageProps) {
  switch (message.role) {
    case AGENT_MESSAGE_ROLE.USER:
      return (
        <div className="flex justify-end">
          <div className="max-w-bubble bg-secondary/15 rounded-md px-3 py-2">
            <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono wrap-break-word leading-relaxed">
              {message.content}
            </pre>
          </div>
        </div>
      );

    case AGENT_MESSAGE_ROLE.AGENT:
      return (
        <div className="bg-surface-elevated/30 rounded-md px-3 py-2">
          <MarkdownRenderer content={message.content} />
        </div>
      );

    case AGENT_MESSAGE_ROLE.SYSTEM:
      return <ActivityItem toolName={message.toolName ?? ""} content={message.content} />;

    default:
      return null;
  }
}
