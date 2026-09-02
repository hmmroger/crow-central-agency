import { useCallback, useMemo } from "react";
import type { Schedule } from "@crow-central-agency/shared";
import { useSchedulesQuery } from "../../hooks/queries/use-schedules-query.js";
import { formatScheduleTiming } from "../../utils/format-schedule-timing.js";
import { selectSchedulesForAgent } from "../../utils/schedule-utils.js";
import { cn } from "../../utils/cn.js";
import { FieldGroup } from "./field-group.js";

interface AgentSchedulesSectionProps {
  /** Undefined while creating a new agent */
  agentId: string | undefined;
  /** Closes the editor and switches to the Schedules view, confirming discard when dirty */
  onOpenSchedulesView: () => void;
}

interface AgentSchedulesSectionBodyProps {
  agentId: string;
  onOpenSchedulesView: () => void;
}

interface AgentScheduleRowProps {
  schedule: Schedule;
  onOpen: () => void;
}

/** Read-only list of the schedules targeting the agent being edited */
export function AgentSchedulesSection({ agentId, onOpenSchedulesView }: AgentSchedulesSectionProps) {
  if (!agentId) {
    return null;
  }

  return <AgentSchedulesSectionBody agentId={agentId} onOpenSchedulesView={onOpenSchedulesView} />;
}

function AgentSchedulesSectionBody({ agentId, onOpenSchedulesView }: AgentSchedulesSectionBodyProps) {
  const { data: schedules = [], isLoading, error } = useSchedulesQuery();

  const targetingSchedules = useMemo(() => selectSchedulesForAgent(schedules, agentId), [schedules, agentId]);

  return (
    <FieldGroup label="Schedules targeting this agent">
      {isLoading && <p className="text-xs text-text-muted">Loading schedules...</p>}

      {error && <p className="text-xs text-error">{error.message}</p>}

      {!isLoading && !error && targetingSchedules.length === 0 && (
        <p className="text-xs text-text-muted">
          No schedules target this agent. Add it as a target from the Schedules view to have it run on a recurring
          basis.
        </p>
      )}

      {targetingSchedules.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {targetingSchedules.map((schedule) => (
            <AgentScheduleRow key={schedule.id} schedule={schedule} onOpen={onOpenSchedulesView} />
          ))}
        </div>
      )}
    </FieldGroup>
  );
}

function AgentScheduleRow({ schedule, onOpen }: AgentScheduleRowProps) {
  const handleClick = useCallback(() => onOpen(), [onOpen]);

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border-subtle/60 bg-surface text-left",
        "cursor-pointer transition-colors hover:border-border/80 hover:bg-surface-elevated/60",
        !schedule.enabled && "opacity-50"
      )}
      onClick={handleClick}
      aria-label={`Open ${schedule.name} in the Schedules view`}
    >
      <span className="flex-1 min-w-0 text-xs font-medium text-text-base truncate">{schedule.name}</span>
      <span className="shrink-0 px-1.5 py-0.5 rounded text-3xs font-mono text-text-muted bg-surface-elevated border border-border-subtle">
        {formatScheduleTiming(schedule)}
      </span>
      {!schedule.enabled && <span className="shrink-0 text-3xs text-warning">paused</span>}
    </button>
  );
}
