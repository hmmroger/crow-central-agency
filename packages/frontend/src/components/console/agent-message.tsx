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
          <div className="max-w-bubble bg-secondary/20 border border-secondary/30 rounded-lg px-4 py-3">
            <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono wrap-break-word leading-relaxed">
              {message.content}
            </pre>
          </div>
        </div>
      );

    case AGENT_MESSAGE_ROLE.AGENT:
      return (
        <div className="bg-surface-elevated/40 border border-border-subtle rounded-lg px-4 py-3">
          <MarkdownRenderer content={message.content} />
        </div>
      );

    case AGENT_MESSAGE_ROLE.SYSTEM:
      return <ActivityItem toolName={message.toolName ?? ""} content={message.content} />;

    default:
      return null;
  }
}
