import { AGENT_MESSAGE_ROLE, AGENT_MESSAGE_TYPE, type AgentMessage } from "@crow-central-agency/shared";
import { MarkdownRenderer } from "../../common/markdown-renderer.js";
import { ActivityItem } from "./activity-item.js";
import { ThinkingMessage } from "./thinking-message.js";
import { MessageActions } from "./message-actions.js";

interface AgentMessageProps {
  agentId: string;
  message: AgentMessage;
}

/**
 * Renders a single committed message in the agent console by role.
 * User messages are right-aligned bubbles, agent messages are left-aligned bubbles.
 * Per-message actions render below the bubble via MessageActions.
 */
export function AgentMessageView({ agentId, message }: AgentMessageProps) {
  switch (message.role) {
    case AGENT_MESSAGE_ROLE.USER:
      return (
        <div className="group">
          <div className="flex justify-end">
            <div className="max-w-bubble bg-secondary/15 rounded-md px-3">
              <pre className="text-sm text-text-base whitespace-pre-wrap font-mono wrap-break-word leading-relaxed">
                {message.content}
              </pre>
            </div>
          </div>
          <MessageActions agentId={agentId} message={message} align="end" />
        </div>
      );

    case AGENT_MESSAGE_ROLE.AGENT:
      if (message.type === AGENT_MESSAGE_TYPE.THINKING) {
        return <ThinkingMessage content={message.content} />;
      }

      return (
        <div className="group">
          <div className="bg-surface-elevated/30 rounded-md px-3">
            <MarkdownRenderer content={message.content} />
          </div>
          <MessageActions agentId={agentId} message={message} />
        </div>
      );

    case AGENT_MESSAGE_ROLE.SYSTEM:
      if (message.type === AGENT_MESSAGE_TYPE.TOOL_USE) {
        return <ActivityItem toolName={message.toolName} content={message.content} />;
      }

      return null;

    default:
      return null;
  }
}
