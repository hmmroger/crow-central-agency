import { useCallback, useState } from "react";
import { AGENT_STATUS, type AgentConfig } from "@crow-central-agency/shared";
import { useAgentMessagesQuery } from "../../../hooks/queries/use-agent-messages-query.js";
import { useAgentStateQuery } from "../../../hooks/queries/use-agent-state-query.js";
import { useAgentStreamState } from "../../../hooks/queries/use-agent-stream-state.js";
import { useAgentActions } from "../../../hooks/queries/use-agent-actions.js";
import { useAppStore } from "../../../stores/app-store.js";
import { AgentCardHeader } from "./agent-card-header.js";
import { AgentCardMessages } from "./agent-card-messages.js";
import { AgentComposer } from "../../common/agent-composer.js";
import { AgentCardPermission } from "./agent-card-permission.js";
import { AgentCardQuestion } from "./agent-card-question.js";

interface AgentCardProps {
  agent: AgentConfig;
}

/**
 * Rich agent card - full control panel always visible.
 * Collapsed shows everything with truncated messages.
 * Expanded doubles message area height and removes truncation.
 * Each card composes query hooks for its own agent data.
 */
export function AgentCard({ agent }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: messages = [] } = useAgentMessagesQuery(agent.id);
  const { data: agentState } = useAgentStateQuery(agent.id);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const { streamingText, activeToolUse } = useAgentStreamState(agent.id);
  const pendingPermissions = agentState?.pendingPermissions ?? [];
  const pendingQuestion = agentState?.pendingQuestion;
  const { allowPermission, allowAlwaysPermission, denyPermission } = useAgentActions(agent.id);
  const goToAgentConsole = useAppStore((state) => state.goToAgentConsole);
  const openConsole = useCallback(() => goToAgentConsole(agent.id), [goToAgentConsole, agent.id]);

  return (
    <div
      className={`flex flex-col rounded-lg bg-surface border border-border-subtle hover:border-border transition-colors`}
    >
      <div className="shrink-0 border-b border-border-subtle px-2.5 py-2">
        <AgentCardHeader
          agent={agent}
          status={status}
          messages={messages}
          expanded={expanded}
          onToggleExpand={() => setExpanded(!expanded)}
        />
      </div>

      {/* Messages - fills remaining space, expand controls truncation */}
      <AgentCardMessages
        messages={messages}
        streamingText={streamingText}
        expanded={expanded}
        activeToolUse={activeToolUse}
      />

      {pendingPermissions.length > 0 && (
        <div className="shrink-0 px-2.5 py-2 animate-fade-in">
          <AgentCardPermission
            permissions={pendingPermissions}
            onAllow={allowPermission}
            onAllowAlways={allowAlwaysPermission}
            onDeny={denyPermission}
          />
        </div>
      )}

      {pendingQuestion && (
        <div className="shrink-0 px-2.5 py-2 animate-fade-in">
          <AgentCardQuestion questionCount={pendingQuestion.questions.length} onOpen={openConsole} />
        </div>
      )}

      <div className="shrink-0 border-t border-border-subtle px-2.5 py-2">
        <AgentComposer agentId={agent.id} variant="compact" />
      </div>
    </div>
  );
}
