import { AGENT_MESSAGE_KIND, type AgentMessage } from "../../hooks/use-agent-interaction.types.js";
import { MarkdownRenderer } from "./markdown-renderer.js";
import { ActivityItem } from "./activity-item.js";
import { ResultBanner } from "./result-banner.js";

interface AgentMessageProps {
  message: AgentMessage;
}

/**
 * Renders a single message in the agent console — text, activity, or result.
 */
export function AgentMessageView({ message }: AgentMessageProps) {
  switch (message.kind) {
    case AGENT_MESSAGE_KIND.TEXT:
      return (
        <div className="px-4 py-2">
          <MarkdownRenderer content={message.text ?? ""} />
        </div>
      );

    case AGENT_MESSAGE_KIND.ACTIVITY:
      return (
        <ActivityItem
          toolName={message.toolName ?? ""}
          description={message.description ?? ""}
          isSubagent={message.isSubagent}
        />
      );

    case AGENT_MESSAGE_KIND.RESULT:
      return (
        <div className="px-4 py-1">
          <ResultBanner
            subtype={message.subtype ?? "success"}
            costUsd={message.costUsd}
            durationMs={message.durationMs}
          />
        </div>
      );

    case AGENT_MESSAGE_KIND.USAGE:
      return null;

    default:
      return null;
  }
}
