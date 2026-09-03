import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import { TIME_MODE, type DayOfWeek, type SchedulerTime, type TimeModeType } from "@crow-central-agency/shared";
import { DAY_LABELS, WEEK_ORDER } from "../../utils/day-of-week-display.js";

interface ScheduleTimingPanelProps {
  daysOfWeek: DayOfWeek[];
  timeMode: TimeModeType;
  times: SchedulerTime[];
  /** Upper bound on AT-mode time entries */
  maxTimes: number;
  onDaysChange: (days: DayOfWeek[]) => void;
  onTimeModeChange: (mode: TimeModeType) => void;
  onTimesChange: (updater: (prev: SchedulerTime[]) => SchedulerTime[]) => void;
}

const MODE_BUTTON_BASE = "px-2 py-1 rounded text-xs border transition-colors";
const DAY_BUTTON_BASE = "px-2 py-0.5 rounded text-xs border transition-colors";
const ACTIVE_BUTTON = "bg-primary/20 text-primary border-primary/30";
const INACTIVE_BUTTON = "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral";
const TIME_INPUT_CLASS =
  "w-14 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-base text-sm focus:outline-none focus:border-border-focus";

function toggleDayIn(daysOfWeek: DayOfWeek[], day: DayOfWeek): DayOfWeek[] {
  return daysOfWeek.includes(day) ? daysOfWeek.filter((selectedDay) => selectedDay !== day) : [...daysOfWeek, day];
}

function withTimeFieldAt(
  times: SchedulerTime[],
  index: number,
  field: keyof SchedulerTime,
  value: number | undefined
): SchedulerTime[] {
  return times.map((time, timeIndex) => (timeIndex === index ? { ...time, [field]: value } : time));
}

/**
 * Active days, At/Every mode, and the time entries behind them.
 * Shared by the Schedule editor and the agent Loop panel.
 */
export function ScheduleTimingPanel({
  daysOfWeek,
  timeMode,
  times,
  maxTimes,
  onDaysChange,
  onTimeModeChange,
  onTimesChange,
}: ScheduleTimingPanelProps) {
  const isAtMode = timeMode === TIME_MODE.AT;
  const canAddTime = isAtMode && times.length < maxTimes;

  const toggleDay = useCallback(
    (day: DayOfWeek) => onDaysChange(toggleDayIn(daysOfWeek, day)),
    [daysOfWeek, onDaysChange]
  );

  const updateTimeAt = useCallback(
    (index: number, field: keyof SchedulerTime, rawValue: string) => {
      const value = rawValue ? Number(rawValue) : undefined;
      onTimesChange((prev) => withTimeFieldAt(prev, index, field, value));
    },
    [onTimesChange]
  );

  const addTime = useCallback(() => onTimesChange((prev) => [...prev, {}]), [onTimesChange]);

  const removeTime = useCallback(
    (index: number) => onTimesChange((prev) => prev.filter((_, timeIndex) => timeIndex !== index)),
    [onTimesChange]
  );

  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs text-text-muted mb-1 block">Active days</span>
        <div className="flex flex-wrap gap-1">
          {WEEK_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              className={`${DAY_BUTTON_BASE} ${daysOfWeek.includes(day) ? ACTIVE_BUTTON : INACTIVE_BUTTON}`}
              onClick={() => toggleDay(day)}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
        <p className="text-3xs text-text-muted mt-1">No days selected means every day.</p>
      </div>

      <div>
        <span className="text-xs text-text-muted mb-1 block">Schedule</span>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${MODE_BUTTON_BASE} ${isAtMode ? ACTIVE_BUTTON : INACTIVE_BUTTON}`}
            onClick={() => onTimeModeChange(TIME_MODE.AT)}
          >
            At
          </button>
          <button
            type="button"
            className={`${MODE_BUTTON_BASE} ${!isAtMode ? ACTIVE_BUTTON : INACTIVE_BUTTON}`}
            onClick={() => onTimeModeChange(TIME_MODE.EVERY)}
          >
            Every
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-xs text-text-muted block">{isAtMode ? "Times" : "Interval"}</span>

        {isAtMode ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
            {times.map((time, index) => (
              <div key={index} className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={time.hour ?? ""}
                  onChange={(event) => updateTimeAt(index, "hour", event.target.value)}
                  placeholder="HH"
                  aria-label={`Hour for time ${index + 1}`}
                  className={TIME_INPUT_CLASS}
                />
                <span className="text-text-muted text-sm">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={time.minute ?? ""}
                  onChange={(event) => updateTimeAt(index, "minute", event.target.value)}
                  placeholder="MM"
                  aria-label={`Minute for time ${index + 1}`}
                  className={TIME_INPUT_CLASS}
                />
                {times.length > 1 && (
                  <button
                    type="button"
                    className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                    onClick={() => removeTime(index)}
                    title="Remove time"
                    aria-label={`Remove time ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div>
              <span className="text-xs text-text-muted mb-1 block">Hours</span>
              <input
                type="number"
                min={0}
                max={23}
                value={times[0]?.hour ?? ""}
                onChange={(event) => updateTimeAt(0, "hour", event.target.value)}
                aria-label="Interval hours"
                className={TIME_INPUT_CLASS}
              />
            </div>
            <div>
              <span className="text-xs text-text-muted mb-1 block">Minutes</span>
              <input
                type="number"
                min={0}
                max={59}
                value={times[0]?.minute ?? ""}
                onChange={(event) => updateTimeAt(0, "minute", event.target.value)}
                aria-label="Interval minutes"
                className={TIME_INPUT_CLASS}
              />
            </div>
          </div>
        )}

        {canAddTime && (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
            onClick={addTime}
          >
            <Plus className="h-3 w-3" />
            Add time
          </button>
        )}
      </div>
    </div>
  );
}
