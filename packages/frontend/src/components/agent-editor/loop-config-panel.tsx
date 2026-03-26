import { DAY_OF_WEEK, TIME_MODE, type DayOfWeek, type TimeMode } from "@crow-central-agency/shared";

interface LoopConfigPanelProps {
  enabled: boolean;
  daysOfWeek: DayOfWeek[];
  timeMode: TimeMode;
  hour?: number;
  minute?: number;
  prompt: string;
  onEnabledChange: (enabled: boolean) => void;
  onDaysChange: (days: DayOfWeek[]) => void;
  onTimeModeChange: (mode: TimeMode) => void;
  onHourChange: (hour: number | undefined) => void;
  onMinuteChange: (minute: number | undefined) => void;
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
 * Loop configuration panel — enable/disable, days, time mode, hour/minute, prompt.
 */
export function LoopConfigPanel({
  enabled,
  daysOfWeek,
  timeMode,
  hour,
  minute,
  prompt,
  onEnabledChange,
  onDaysChange,
  onTimeModeChange,
  onHourChange,
  onMinuteChange,
  onPromptChange,
}: LoopConfigPanelProps) {
  const toggleDay = (day: DayOfWeek) => {
    if (daysOfWeek.includes(day)) {
      onDaysChange(daysOfWeek.filter((selectedDay) => selectedDay !== day));
    } else {
      onDaysChange([...daysOfWeek, day]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm text-text-primary">Enable loop</span>
      </label>

      {enabled && (
        <>
          {/* Days of week */}
          <div>
            <span className="text-xs text-text-muted mb-1 block">Active days</span>
            <div className="flex gap-1">
              {ALL_DAYS.map((day) => {
                const isActive = daysOfWeek.includes(day);
                const activeClass = "bg-primary/20 text-primary border-primary/30";
                const inactiveClass = "bg-surface-inset text-text-muted border-border-subtle hover:text-text-secondary";

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
                  timeMode === TIME_MODE.AT
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-secondary"
                }`}
                onClick={() => onTimeModeChange(TIME_MODE.AT)}
              >
                At
              </button>
              <button
                type="button"
                className={`px-2 py-1 rounded text-xs border transition-colors ${
                  timeMode === TIME_MODE.EVERY
                    ? "bg-primary/20 text-primary border-primary/30"
                    : "bg-surface-inset text-text-muted border-border-subtle hover:text-text-secondary"
                }`}
                onClick={() => onTimeModeChange(TIME_MODE.EVERY)}
              >
                Every
              </button>
            </div>
          </div>

          {/* Hour / Minute */}
          <div className="flex gap-3">
            <div>
              <span className="text-xs text-text-muted mb-1 block">{timeMode === TIME_MODE.AT ? "Hour" : "Hours"}</span>
              <input
                type="number"
                min={0}
                max={23}
                value={hour ?? ""}
                onChange={(event) => onHourChange(event.target.value ? Number(event.target.value) : undefined)}
                className="w-16 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus"
              />
            </div>
            <div>
              <span className="text-xs text-text-muted mb-1 block">
                {timeMode === TIME_MODE.AT ? "Minute" : "Minutes"}
              </span>
              <input
                type="number"
                min={0}
                max={59}
                value={minute ?? ""}
                onChange={(event) => onMinuteChange(event.target.value ? Number(event.target.value) : undefined)}
                className="w-16 px-2 py-1 rounded bg-surface-inset border border-border-subtle text-text-primary text-sm focus:outline-none focus:border-border-focus"
              />
            </div>
          </div>

          {/* Prompt */}
          <div>
            <span className="text-xs text-text-muted mb-1 block">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="Message to send on each loop tick..."
              rows={2}
              className="w-full px-3 py-2 rounded-md bg-surface-inset border border-border-subtle text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-border-focus resize-y"
            />
          </div>
        </>
      )}
    </div>
  );
}
