import type { AgentConfig } from "@crow-central-agency/shared";
import { useAgentInteraction } from "../../hooks/use-agent-interaction.js";
import { AgentConsoleHeader } from "./agent-console-header.js";
import { MessageList } from "./message-list.js";
import { MessageInput } from "./message-input.js";
import { PermissionQueue } from "./permission-queue.js";

interface AgentConsoleProps {
  agent: AgentConfig;
}

/**
 * Full agent console view — header + permissions + message list + input.
 * Uses useAgentInteraction hook for all state and actions.
 */
export function AgentConsole({ agent }: AgentConsoleProps) {
  const {
    messages,
    streamingText,
    isStreaming,
    status,
    usage,
    pendingPermissions,
    sendMessage,
    injectMessage,
    abort,
    newConversation,
    compact,
    allowPermission,
    denyPermission,
  } = useAgentInteraction(agent.id);

  return (
    <div className="flex flex-col h-full">
      <AgentConsoleHeader
        agent={agent}
        status={status}
        usage={usage}
        isStreaming={isStreaming}
        onCompact={compact}
        onNewSession={newConversation}
      />

      <MessageList messages={messages} streamingText={streamingText} isStreaming={isStreaming} />

      <PermissionQueue permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />

      <MessageInput onSend={sendMessage} onInject={injectMessage} onAbort={abort} isStreaming={isStreaming} />
    </div>
  );
}
