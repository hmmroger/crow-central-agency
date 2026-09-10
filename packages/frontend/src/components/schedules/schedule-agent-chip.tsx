import { useCallback } from "react";
import { Chip } from "../common/chip.js";
import { UNKNOWN_AGENT_LABEL } from "../../utils/schedule-utils.js";

interface ScheduleAgentChipProps {
  agentId: string;
  /** Omitted when the id resolves to no agent */
  name?: string;
  /** Called with this chip's agent id */
  onRemove: (agentId: string) => void;
}

/** Removable chip for one agent a schedule targets, or for an id that no longer resolves to one. */
export function ScheduleAgentChip({ agentId, name, onRemove }: ScheduleAgentChipProps) {
  const handleRemove = useCallback(() => onRemove(agentId), [onRemove, agentId]);

  return (
    <Chip
      label={name ?? UNKNOWN_AGENT_LABEL}
      onRemove={handleRemove}
      removeAriaLabel={name ? `Remove agent ${name}` : `Remove ${UNKNOWN_AGENT_LABEL} ${agentId}`}
      className={name ? "text-text-neutral" : "text-text-muted"}
    />
  );
}
