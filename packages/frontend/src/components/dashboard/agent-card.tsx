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
    usage,
    pendingPermissions,
    sendMessage,
    injectMessage,
    allowPermission,
    denyPermission,
  } = useAgentInteraction(agent.id);

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors ${expanded ? "h-96" : "h-48"}`}
    >
      <div className="shrink-0">
        <AgentCardHeader
          agent={agent}
          status={status}
          expanded={expanded}
          onToggleExpand={() => setExpanded(!expanded)}
        />
      </div>

      {(usage.totalCostUsd > 0 || usage.inputTokens > 0) && (
        <div className="shrink-0">
          <AgentCardUsage usage={usage} />
        </div>
      )}

      {pendingPermissions.length > 0 && (
        <div className="shrink-0">
          <AgentCardPermission permissions={pendingPermissions} onAllow={allowPermission} onDeny={denyPermission} />
        </div>
      )}

      {/* Messages — fills remaining space, expand controls truncation */}
      <AgentCardMessages messages={messages} streamingText={streamingText} expanded={expanded} />

      <div className="shrink-0">
        <AgentCardInput
          onSend={(text) => (isStreaming ? injectMessage(text) : sendMessage(text))}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
