import { useMemo, useRef } from "react";
import { CalendarClock, Plus, RefreshCw } from "lucide-react";
import { useSchedulesQuery } from "../../hooks/queries/use-schedules-query.js";
import { useOpenScheduleEditor } from "../../hooks/dialogs/use-open-schedule-editor.js";
import { useContainerColumns } from "../../hooks/use-container-columns.js";
import { compareSchedules } from "../../utils/schedule-utils.js";
import { cn } from "../../utils/cn.js";
import { HeaderPortal } from "../layout/header-portal.js";
import { ACTION_BUTTON_VARIANT, ActionButton } from "../common/action-button.js";
import { EmptyState } from "../common/empty-state.js";
import { ScheduleCard } from "./schedule-card.js";

/** Schedule cards stop at two columns — narrower than that the row actions and chips crowd the name */
const SCHEDULE_GRID_BREAKPOINTS = [
  { minWidth: 0, columns: 1 },
  { minWidth: 1024, columns: 2 },
];

/** Caps the content column so the list does not stretch edge to edge on a wide screen */
const CONTENT_WIDTH_CLASS = "w-full max-w-6xl mx-auto";

/**
 * Schedules view — top-level view for managing schedules that fan out to agents.
 */
export function SchedulesView() {
  const { data: schedules = [], isLoading, error, refetch } = useSchedulesQuery();
  const openScheduleEditor = useOpenScheduleEditor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useContainerColumns({ containerRef: scrollRef, breakpoints: SCHEDULE_GRID_BREAKPOINTS });

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

      <div className="px-6 pt-4 pb-2">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-6">
        <div
          className={cn(CONTENT_WIDTH_CLASS, "grid items-stretch gap-3")}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {sortedSchedules.map((schedule) => (
            <ScheduleCard key={schedule.id} schedule={schedule} onEdit={() => openScheduleEditor(schedule.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
