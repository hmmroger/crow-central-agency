import { AGENT_STATUS, type AgentConfig } from "@crow-central-agency/shared";
import { useAgentStateQuery } from "../../hooks/use-agent-state-query.js";
import { getAgentAbbreviation } from "../../utils/agent-abbreviation.js";
import { cn } from "../../utils/cn.js";

interface AgentCommandPillProps {
  agent: AgentConfig;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Square pill in the agent command strip.
 *
 * Visual states (can overlap):
 * - Default: subtle border, muted text
 * - Selected: primary border + text, left indicator line
 * - Streaming/active: accent border + text, dot at upper-right
 */
export function AgentCommandPill({ agent, isSelected, onClick }: AgentCommandPillProps) {
  const { data: agentState } = useAgentStateQuery(agent.id);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const isStreaming = status === AGENT_STATUS.STREAMING || status === AGENT_STATUS.COMPACTING;
  const abbreviation = getAgentAbbreviation(agent.name);

  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center justify-center w-9 h-9 rounded-xs font-mono text-3xs border transition-colors",
        isStreaming
          ? "border-accent text-accent"
          : isSelected
            ? "border-primary text-primary bg-primary/15"
            : "border-border-subtle text-text-muted hover:text-text-primary hover:border-border"
      )}
      onClick={onClick}
      title={agent.name}
    >
      {/* Left selection indicator */}
      {isSelected && <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-primary" />}

      {abbreviation}

      {/* Streaming dot — upper-right corner */}
      {isStreaming && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-base" />
      )}
    </button>
  );
}
