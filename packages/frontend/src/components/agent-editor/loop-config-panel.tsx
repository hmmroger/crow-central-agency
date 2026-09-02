import { MAX_LOOP_TIMES, type DayOfWeek, type SchedulerTime, type TimeModeType } from "@crow-central-agency/shared";
import { Toggle } from "../common/toggle.js";
import { FieldGroup } from "./field-group.js";
import { ScheduleTimingPanel } from "../schedules/schedule-timing-panel.js";

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

/**
 * Loop configuration panel - enable/disable, timing, prompt.
 * Timing is delegated to the shared ScheduleTimingPanel.
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
  return (
    <FieldGroup label="Loop Schedule">
      <div className="space-y-3">
        <Toggle checked={enabled} onChange={onEnabledChange} label="Enable loop" />

        {enabled && (
          <>
            <ScheduleTimingPanel
              daysOfWeek={daysOfWeek}
              timeMode={timeMode}
              times={times}
              maxTimes={MAX_LOOP_TIMES}
              onDaysChange={onDaysChange}
              onTimeModeChange={onTimeModeChange}
              onTimesChange={onTimesChange}
            />

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
