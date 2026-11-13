import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentState } from "../../../hooks/use-agent-state.js";
import { STATUS_DOT_COLOR, STATUS_LABEL } from "../../../utils/agent-status-display.js";
import { cn } from "../../../utils/cn.js";
import { CommandPaletteBadge } from "../../common/command-palette/command-palette-badge.js";

interface AgentPaletteRowStatusProps {
  agentId: string;
  isCurrent: boolean;
}

const CURRENT_BADGE_LABEL = "Current";

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

      {isCurrent && <CommandPaletteBadge label={CURRENT_BADGE_LABEL} />}
    </>
  );
}
