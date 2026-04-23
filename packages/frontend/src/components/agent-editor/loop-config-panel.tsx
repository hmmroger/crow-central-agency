import { Plus, X } from "lucide-react";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";
import {
  DAY_OF_WEEK,
  MAX_LOOP_TIMES,
  TIME_MODE,
  type DayOfWeek,
  type SchedulerTime,
  type TimeModeType,
} from "@crow-central-agency/shared";

interface LoopConfigPanelProps {
  enabled: boolean;
  daysOfWeek: DayOfWeek[];
  timeMode: TimeModeType;
  times: SchedulerTime[];
  prompt: string;
  onEnabledChange: (enabled: boolean) => void;
  onDaysChange: (days: DayOfWeek[]) => void;
  onTimeModeChange: (mode: TimeModeType) => void;
  onTimesChange: (updater: (prev: SchedulerTime[]) => SchedulerTime[]) => void;
  onPromptChange: (prompt: string) => void;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  [DAY_OF_WEEK.MONDAY]: "Mon",
  [DAY_OF_WEEK.TUESDAY]: "Tue",
  [DAY_OF_WEEK.WEDNESDAY]: "Wed",
  [DAY_OF_WEEK.THURSDAY]: "Thu",
  [DAY_OF_WEEK.FRIDAY]: "Fri",
  [DAY_OF_WEEK.SATURDAY]: "Sat",
  [DAY_OF_WEEK.SUNDAY]: "Sun",
};

const ALL_DAYS = Object.values(DAY_OF_WEEK) as DayOfWeek[];

/**
 * Loop configuration panel - enable/disable, days, time mode, times, prompt.
 * AT mode supports multiple time entries (up to MAX_LOOP_TIMES).
 * EVERY mode uses a single time entry for the interval.
 */
export function LoopConfigPanel({
  enabled,
  daysOfWeek,
  timeMode,
  times,
  prompt,
  onEnabledChange,
  onDaysChange,
  onTimeModeChange,
  onTimesChange,
  onPromptChange,
}: LoopConfigPanelProps) {
  const toggleDay = (day: DayOfWeek) => {
    if (daysOfWeek.includes(day)) {
      onDaysChange(daysOfWeek.filter((selectedDay) => selectedDay !== day));
    } else {
      onDaysChange([...daysOfWeek, day]);
    }
  };

  const isAtMode = timeMode === TIME_MODE.AT;
  const canAddTime = isAtMode && times.length < MAX_LOOP_TIMES;

  /** Update a single time entry at the given index */
  const updateTimeAt = (index: number, field: keyof SchedulerTime, rawValue: string) => {
    const value = rawValue ? Number(rawValue) : undefined;
    onTimesChange((prev) => prev.map((time, idx) => (idx === index ? { ...time, [field]: value } : time)));
  };

  /** Add a new empty time entry */
  const addTime = () => {
    onTimesChange((prev) => [...prev, {}]);
  };

  /** Remove a time entry at the given index */
  const removeTime = (index: number) => {
    onTimesChange((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <FieldGroup label="Loop Schedule">
      <div className="space-y-3">
        {/* Enable toggle */}
        <Toggle checked={enabled} onChange={onEnabledChange} label="Enable loop" />

        {enabled && (
          <>
            {/* Days of week */}
            <div>
              <span className="text-xs text-text-muted mb-1 block">Active days</span>
              <div className="flex gap-1">
                {ALL_DAYS.map((day) => {
                  const isActive = daysOfWeek.includes(day);
                  const activeClass = "bg-primary/20 text-primary border-primary/30";
                  const inactiveClass = "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral";

                  return (
                    <button
                      key={day}
                      type="button"
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${isActive ? activeClass : inactiveClass}`}
                      onClick={() => toggleDay(day)}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time mode */}
            <div>
              <span className="text-xs text-text-muted mb-1 block">Schedule</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    isAtMode
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral"
                  }`}
                  onClick={() => onTimeModeChange(TIME_MODE.AT)}
                >
                  At
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 rounded text-xs border transition-colors ${
                    !isAtMode
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-neutral"
                  }`}
                  onClick={() => onTimeModeChange(TIME_MODE.EVERY)}
                >
                  Every
                </button>
              </div>
            </div>

            {/* Time entries */}
            <div className="space-y-2">
              <span className="text-xs text-text-muted block">{isAtMode ? "Times" : "Interval"}</span>

              {times.map((time, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div>
                    <span className="text-xs text-text-muted mb-1 block">{isAtMode ? "Hour" : "Hours"}</span>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={time.hour ?? ""}
                      onChange={(event) => updateTimeAt(index, "hour", event.target.value)}
                      className="w-16 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-base text-sm focus:outline-none focus:border-border-focus"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-text-muted mb-1 block">{isAtMode ? "Minute" : "Minutes"}</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={time.minute ?? ""}
                      onChange={(event) => updateTimeAt(index, "minute", event.target.value)}
                      className="w-16 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-base text-sm focus:outline-none focus:border-border-focus"
                    />
                  </div>
                  {isAtMode && times.length > 1 && (
                    <button
                      type="button"
                      className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                      onClick={() => removeTime(index)}
                      title="Remove time"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

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

            {/* Prompt */}
            <div>
              <span className="text-xs text-text-muted mb-1 block">Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => onPromptChange(event.target.value)}
                placeholder="Message to send on each loop tick..."
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-base text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
              />
            </div>
          </>
        )}
      </div>
    </FieldGroup>
  );
}
