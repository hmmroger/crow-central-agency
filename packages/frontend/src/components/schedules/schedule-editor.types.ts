import type { DayOfWeek, SchedulerTime, TimeModeType } from "@crow-central-agency/shared";

/** Editable state of the schedule editor form */
export interface ScheduleEditorFormState {
  name: string;
  message: string;
  enabled: boolean;
  agentIds: string[];
  daysOfWeek: DayOfWeek[];
  timeMode: TimeModeType;
  times: SchedulerTime[];
  newSession: boolean;
}
