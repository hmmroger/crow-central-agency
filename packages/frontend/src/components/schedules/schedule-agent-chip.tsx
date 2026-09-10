import { useCallback } from "react";
import { Chip } from "../common/chip.js";

interface ScheduleAgentChipProps {
  agentId: string;
  name: string;
  /** Called with this chip's agent id */
  onRemove: (agentId: string) => void;
}

/** Removable chip for one agent a schedule targets. */
export function ScheduleAgentChip({ agentId, name, onRemove }: ScheduleAgentChipProps) {
  const handleRemove = useCallback(() => onRemove(agentId), [onRemove, agentId]);

  return (
    <Chip label={name} onRemove={handleRemove} removeAriaLabel={`Remove agent ${name}`} className="text-text-neutral" />
  );
}
