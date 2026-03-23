import { useState } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { useAgentInteraction } from "../../hooks/use-agent-interaction.js";
import { AgentCardHeader } from "./agent-card-header.js";
import { AgentCardMessages } from "./agent-card-messages.js";
import { AgentCardInput } from "./agent-card-input.js";
import { AgentCardUsage } from "./agent-card-usage.js";
import { AgentCardPermission } from "./agent-card-permission.js";

interface AgentCardProps {
  agent: AgentConfig;
}

/**
 * Rich agent card with mini-console, usage, permissions, and quick-send.
 * Each card owns its own useAgentInteraction(agentId) instance.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const {
    messages,
    streamingText,
    isStreaming,
    status,
    usage,
    pendingPermissions,
    sendMessage,
    injectMessage,
    allowPermission,
    denyPermission,
  } = useAgentInteraction(agent.id);

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors">
      <AgentCardHeader
        agent={agent}
        status={status}
        expanded={expanded}
        onToggleExpand={() => setExpanded(!expanded)}
      />

      {/* Meta row — model + usage */}
      <div className="flex items-center justify-between ml-4">
        <span className="text-xs font-mono text-text-muted px-1.5 py-0.5 rounded bg-surface-inset">{agent.model}</span>
        <AgentCardUsage usage={usage} />
      </div>

      {/* Permission indicator */}
      <AgentCardPermission
        permissions={pendingPermissions}
        onAllow={allowPermission}
        onDeny={(toolUseId) => denyPermission(toolUseId)}
      />

      {/* Expanded content — mini-console + input */}
      {expanded && (
        <div className="space-y-2 pt-1 border-t border-border-subtle">
          <AgentCardMessages messages={messages} streamingText={streamingText} />
          <AgentCardInput
            onSend={(text) => (isStreaming ? injectMessage(text) : sendMessage(text))}
            isStreaming={isStreaming}
          />
        </div>
      )}
    </div>
  );
}
