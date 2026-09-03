import { useMemo } from "react";
import { CalendarClock, Plus, RefreshCw } from "lucide-react";
import { useSchedulesQuery } from "../../hooks/queries/use-schedules-query.js";
import { useOpenScheduleEditor } from "../../hooks/dialogs/use-open-schedule-editor.js";
import { compareSchedules } from "../../utils/schedule-utils.js";
import { cn } from "../../utils/cn.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { EmptyState } from "../common/empty-state.js";
import { ScheduleCard } from "./schedule-card.js";

/** Shared so the toolbar and the grid cap at the same width and cannot drift out of alignment */
const CONTENT_WIDTH_CLASS = "w-full max-w-6xl mx-auto";

/**
 * Schedules view — top-level view for managing schedules that fan out to agents.
 */
export function SchedulesView() {
  const { data: schedules = [], isLoading, error, refetch } = useSchedulesQuery();
  const openScheduleEditor = useOpenScheduleEditor();

  const sortedSchedules = useMemo(() => schedules.toSorted(compareSchedules), [schedules]);

  if (isLoading) {
    return <HeaderPortal title="Schedules" />;
  }

  if (error) {
    return (
      <>
        <HeaderPortal title="Schedules" />
        <div className="h-full flex flex-col items-center justify-center gap-4 text-text-muted">
          <p className="text-lg text-error">{error.message}</p>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated text-text-base text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </>
    );
  }

  if (sortedSchedules.length === 0) {
    return (
      <>
        <HeaderPortal title="Schedules" />
        <EmptyState
          message="No schedules yet"
          description="Create a schedule to send a message to one or more agents on a recurring basis."
          actionLabel="New Schedule"
          actionIcon={Plus}
          onAction={() => openScheduleEditor()}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <HeaderPortal title="Schedules" />

      <div className="px-6 pt-4 pb-4">
        <div className={cn(CONTENT_WIDTH_CLASS, "flex items-center justify-between")}>
          <span className="flex items-center gap-1.5 text-3xs text-text-muted font-mono tabular-nums">
            <CalendarClock className="h-3.5 w-3.5" />
            {sortedSchedules.length} schedule{sortedSchedules.length !== 1 ? "s" : ""}
          </span>
          <ActionButton
            icon={Plus}
            label="New Schedule"
            onClick={() => openScheduleEditor()}
            variant={ACTION_BUTTON_VARIANT.PRIMARY_SOLID}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className={cn(CONTENT_WIDTH_CLASS, "grid grid-cols-1 lg:grid-cols-2 gap-3")}>
          {sortedSchedules.map((schedule) => (
            <ScheduleCard key={schedule.id} schedule={schedule} onEdit={() => openScheduleEditor(schedule.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
