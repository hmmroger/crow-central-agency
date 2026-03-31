import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentsQuery } from "../../hooks/use-agents-query.js";
import { useAgentMessagesQuery } from "../../hooks/use-agent-messages-query.js";
import { useAgentStateQuery } from "../../hooks/use-agent-state-query.js";
import { useAgentStreamState } from "../../hooks/use-agent-stream-state.js";
import { useAgentActions } from "../../hooks/use-agent-actions.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { MessageList } from "./message-list.js";
import { MessageInput } from "../common/message-input.js";
import { PermissionQueue } from "./permission-queue.js";

interface AgentConsoleProps {
  agentId: string;
}

/**
 * Agent console - message list + input + permission queue.
 * Composes query hooks for data, stream state for ephemeral WS state, and actions for commands.
 * Status, session actions, and artifacts are handled by the side panel.
 */
export function AgentConsole({ agentId }: AgentConsoleProps) {
  const { data: agents = [], isLoading } = useAgentsQuery();
  const agent = agents.find((item) => item.id === agentId);
  const { data: messages = [] } = useAgentMessagesQuery(agentId);
  const { data: agentState } = useAgentStateQuery(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const { streamingText, activeToolUse, resetStreamState } = useAgentStreamState(agentId);
  const pendingPermissions = agentState?.pendingPermissions ?? [];
  const { sendMessage, injectMessage, abort, allowPermission, denyPermission } = useAgentActions(agentId, {
    resetStreamState,
  });
  const isStreaming = status === AGENT_STATUS.STREAMING;

  if (isLoading || !agent) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        {isLoading ? "Loading..." : "Agent not found"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title={agent.name} />

      {/* Main console area */}
      <div className="flex flex-col flex-1 min-h-0">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          activeToolUse={activeToolUse}
        />

        <div className="max-w-3xl mx-auto px-5 shrink-0">
          <PermissionQueue permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />
        </div>

        <MessageInput onSend={sendMessage} onInject={injectMessage} onAbort={abort} isStreaming={isStreaming} />
      </div>
    </div>
  );
}
