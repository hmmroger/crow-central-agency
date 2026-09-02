import { useCallback, useMemo } from "react";
import { Pencil, Play, Trash2 } from "lucide-react";
import type { Schedule } from "@crow-central-agency/shared";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useConfirmDialog } from "../../hooks/dialogs/use-confirm-dialog.js";
import { useDeleteSchedule, useRunSchedule, useUpdateSchedule } from "../../hooks/queries/use-schedule-mutations.js";
import { formatRelativeTime } from "../../utils/format-utils.js";
import { formatScheduleTiming } from "../../utils/format-schedule-timing.js";
import { cn } from "../../utils/cn.js";
import { Toggle } from "../common/toggle.js";

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: () => void;
}

/** Agent chips rendered inline before collapsing the rest into a +N chip */
const MAX_VISIBLE_AGENT_CHIPS = 4;

const ICON_BUTTON_CLASS =
  "p-1.5 rounded text-text-muted hover:text-text-base hover:bg-surface-elevated transition-colors disabled:opacity-40";

/**
 * Card for a single schedule in the schedules list.
 * Shows the pause toggle, name, timing, last fire, message preview, target agents, and row actions.
 */
export function ScheduleCard({ schedule, onEdit }: ScheduleCardProps) {
  const { agents } = useAgentsContext();
  const confirm = useConfirmDialog();

  const updateSchedule = useUpdateSchedule();
  const runSchedule = useRunSchedule(schedule.id);
  const { deleteFn, isPending: isDeleting } = useDeleteSchedule(schedule.id);

  const agentNames = useMemo(
    () => schedule.agentIds.map((agentId) => agents.find((agent) => agent.id === agentId)?.name ?? "Unknown agent"),
    [schedule.agentIds, agents]
  );

  const visibleAgentNames = agentNames.slice(0, MAX_VISIBLE_AGENT_CHIPS);
  const hiddenAgentCount = agentNames.length - visibleAgentNames.length;

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => updateSchedule.mutate({ scheduleId: schedule.id, input: { enabled } }),
    [updateSchedule, schedule.id]
  );

  const handleRun = useCallback(() => runSchedule.mutate(), [runSchedule]);

  const handleDelete = useCallback(
    () =>
      confirm({
        title: "Delete Schedule",
        message: `Delete "${schedule.name}"? This cannot be undone.`,
        confirmLabel: "Delete",
        destructive: true,
        onConfirm: deleteFn,
      }),
    [confirm, schedule.name, deleteFn]
  );

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border border-border-subtle/60 bg-surface transition-colors hover:border-border/80",
        !schedule.enabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3">
        <Toggle
          checked={schedule.enabled}
          onChange={handleToggleEnabled}
          disabled={updateSchedule.isPending || isDeleting}
          ariaLabel={schedule.enabled ? `Pause ${schedule.name}` : `Resume ${schedule.name}`}
        />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-text-base truncate">{schedule.name}</span>
          <span className="shrink-0 px-1.5 py-0.5 rounded text-3xs font-mono text-text-muted bg-surface-elevated border border-border-subtle">
            {formatScheduleTiming(schedule)}
          </span>
          {!schedule.enabled && <span className="shrink-0 text-3xs text-warning">paused</span>}
          {schedule.lastFiredTimestamp !== undefined && (
            <span className="shrink-0 text-3xs text-text-muted">
              fired {formatRelativeTime(schedule.lastFiredTimestamp)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={handleRun}
            disabled={runSchedule.isPending || isDeleting || schedule.agentIds.length === 0}
            title="Run now"
            aria-label={`Run ${schedule.name} now`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={ICON_BUTTON_CLASS}
            onClick={onEdit}
            disabled={isDeleting}
            title="Edit"
            aria-label={`Edit ${schedule.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors disabled:opacity-40"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete"
            aria-label={`Delete ${schedule.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs text-text-muted mt-1.5 truncate">{schedule.message}</p>

      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {agentNames.length === 0 ? (
          <span className="text-3xs text-warning">No target agents</span>
        ) : (
          <>
            {visibleAgentNames.map((agentName, index) => (
              <span
                key={schedule.agentIds[index]}
                className="px-1.5 py-0.5 rounded text-3xs text-text-neutral bg-surface-inset border border-border-subtle/60 max-w-40 truncate"
              >
                {agentName}
              </span>
            ))}
            {hiddenAgentCount > 0 && <span className="text-3xs text-text-muted">+{hiddenAgentCount}</span>}
          </>
        )}
      </div>
    </div>
  );
}
