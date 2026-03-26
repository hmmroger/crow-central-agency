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
 * Small square pill in the agent command strip — shows abbreviated name,
 * selected state (primary border), and active indicator (accent dot).
 * Each pill owns its own status query for the indicator.
 */
export function AgentCommandPill({ agent, isSelected, onClick }: AgentCommandPillProps) {
  const { data: agentState } = useAgentStateQuery(agent.id);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;
  const isActive =
    status === AGENT_STATUS.STREAMING ||
    status === AGENT_STATUS.WAITING_PERMISSION ||
    status === AGENT_STATUS.WAITING_AGENT ||
    status === AGENT_STATUS.COMPACTING;
  const abbreviation = getAgentAbbreviation(agent.name);

  return (
    <button
      type="button"
      className={cn(
        "relative flex items-center justify-center w-11 h-11 rounded-lg font-mono text-2xs font-semibold transition-colors",
        isSelected
          ? "border-2 border-primary bg-surface-elevated text-primary"
          : "border border-border-subtle bg-surface text-text-muted hover:border-border hover:text-text-primary"
      )}
      onClick={onClick}
      title={agent.name}
    >
      {abbreviation}

      {/* Active indicator dot — shown for streaming, waiting, compacting */}
      {isActive && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-surface animate-pulse" />
      )}
    </button>
  );
}
