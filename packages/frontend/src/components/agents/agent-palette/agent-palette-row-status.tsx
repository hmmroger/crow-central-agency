import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentState } from "../../../hooks/use-agent-state.js";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../../utils/agent-status-display.js";
import { cn } from "../../../utils/cn.js";

interface AgentPaletteRowStatusProps {
  agentId: string;
  isCurrent: boolean;
}

/** Trailing visuals of an agent palette row: live status dot and the Current badge */
export function AgentPaletteRowStatus({ agentId, isCurrent }: AgentPaletteRowStatusProps) {
  const agentState = useAgentState(agentId);
  const status = agentState?.status ?? AGENT_STATUS.IDLE;

  return (
    <>
      {status !== AGENT_STATUS.IDLE && (
        <span
          role="img"
          className={cn("shrink-0 w-2 h-2 rounded-full", STATUS_DOT_COLOR[status])}
          title={STATUS_LABEL[status]}
          aria-label={STATUS_LABEL[status]}
        />
      )}

      {isCurrent && (
        <span className="shrink-0 px-1.5 py-0.5 rounded-xs bg-surface-inset text-3xs uppercase tracking-wider text-text-muted">
          Current
        </span>
      )}
    </>
  );
}
