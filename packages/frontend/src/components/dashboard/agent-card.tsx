import { useState } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAgentInteraction } from "../../hooks/use-agent-interaction.js";
import { AgentCardHeader } from "./agent-card-header.js";
import { AgentCardMessages } from "./agent-card-messages.js";
import { AgentCardInput } from "./agent-card-input.js";
import { AgentCardPermission } from "./agent-card-permission.js";

interface AgentCardProps {
  agent: AgentConfig;
}

/**
 * Rich agent card — full control panel always visible.
 * Collapsed shows everything with truncated messages.
 * Expanded doubles message area height and removes truncation.
 * Each card owns its own useAgentInteraction(agentId) instance.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const {
    messages,
    streamingText,
    isStreaming,
    status,
    pendingPermissions,
    activeToolUse,
    sendMessage,
    injectMessage,
    allowPermission,
    denyPermission,
  } = useAgentInteraction(agent.id);

  return (
    <div
      className={`flex flex-col rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors`}
    >
      <div className="shrink-0 border-b border-border-subtle px-2.5 py-2">
        <AgentCardHeader agent={agent} status={status} onToggleExpand={() => setExpanded(!expanded)} />
      </div>

      {/* Messages — fills remaining space, expand controls truncation */}
      <AgentCardMessages
        messages={messages}
        streamingText={streamingText}
        expanded={expanded}
        activeToolUse={activeToolUse}
      />

      {pendingPermissions.length > 0 && (
        <div className="shrink-0 px-2.5 py-2">
          <AgentCardPermission permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle px-2.5 py-2">
        <AgentCardInput
          onSend={(text) => (isStreaming ? injectMessage(text) : sendMessage(text))}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
