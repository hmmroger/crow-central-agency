import { useState } from "react";
import { AGENT_STATUS, type AgentConfig } from "@crow-central-agency/shared";
import { useAgentMessagesQuery } from "../../hooks/use-agent-messages-query.js";
import { useAgentStateQuery } from "../../hooks/use-agent-state-query.js";
import { useAgentStreamState } from "../../hooks/use-agent-stream-state.js";
import { useAgentActions } from "../../hooks/use-agent-actions.js";
import { AgentCardHeader } from "./agent-card-header.js";
import { AgentCardMessages } from "./agent-card-messages.js";
import { MessageInput } from "../common/message-input.js";
import { AgentCardPermission } from "./agent-card-permission.js";

interface AgentCardProps {
  agent: AgentConfig;
}

/**
 * Rich agent card — full control panel always visible.
 * Collapsed shows everything with truncated messages.
 * Expanded doubles message area height and removes truncation.
 * Each card composes query hooks for its own agent data.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: messages = [] } = useAgentMessagesQuery(agent.id);
  const { data: agentState } = useAgentStateQuery(agent.id);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const { streamingText, activeToolUse, pendingPermissions, removePendingPermission, resetStreamState } =
    useAgentStreamState(agent.id);
  const { sendMessage, injectMessage, abort, allowPermission, denyPermission } = useAgentActions(agent.id, {
    removePendingPermission,
    resetStreamState,
  });
  const isStreaming = status === AGENT_STATUS.STREAMING;

  return (
    <div
      className={`flex flex-col rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors`}
    >
      <div className="shrink-0 border-b border-border-subtle px-2.5 py-2">
        <AgentCardHeader
          agent={agent}
          status={status}
          expanded={expanded}
          onToggleExpand={() => setExpanded(!expanded)}
        />
      </div>

      {/* Messages — fills remaining space, expand controls truncation */}
      <AgentCardMessages
        messages={messages}
        streamingText={streamingText}
        expanded={expanded}
        activeToolUse={activeToolUse}
      />

      {pendingPermissions.length > 0 && (
        <div className="shrink-0 px-2.5 py-2 animate-[fade-in_var(--duration-normal)_var(--ease-out)_both]">
          <AgentCardPermission permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle px-2.5 py-2">
        <MessageInput
          onSend={sendMessage}
          onInject={injectMessage}
          onAbort={abort}
          isStreaming={isStreaming}
          variant="compact"
        />
      </div>
    </div>
  );
}
