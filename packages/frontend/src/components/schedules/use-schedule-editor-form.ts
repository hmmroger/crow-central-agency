import { useCallback, useEffect, useRef, useState } from "react";
import {
  TIME_MODE,
  type DayOfWeek,
  type Schedule,
  type SchedulerTime,
  type TimeModeType,
} from "@crow-central-agency/shared";
import { arraysEqual } from "../../utils/array-utils.js";
import type { ScheduleEditorFormState } from "./schedule-editor.types.js";

/** Default form state for a new schedule */
const DEFAULT_FORM_STATE: ScheduleEditorFormState = {
  name: "",
  message: "",
  enabled: true,
  agentIds: [],
  daysOfWeek: [],
  timeMode: TIME_MODE.EVERY,
  times: [{}],
};

function formStateFromSchedule(schedule: Schedule): ScheduleEditorFormState {
  return {
    name: schedule.name,
    message: schedule.message,
    enabled: schedule.enabled,
    agentIds: schedule.agentIds,
    daysOfWeek: schedule.daysOfWeek,
    timeMode: schedule.timeMode,
    times: schedule.times,
  };
}

function timesEqual(timesA: SchedulerTime[], timesB: SchedulerTime[]): boolean {
  if (timesA.length !== timesB.length) {
    return false;
  }

  return timesA.every((time, index) => time.hour === timesB[index]?.hour && time.minute === timesB[index]?.minute);
}

function isFormEqual(formA: ScheduleEditorFormState, formB: ScheduleEditorFormState): boolean {
  return (
    formA.name === formB.name &&
    formA.message === formB.message &&
    formA.enabled === formB.enabled &&
    formA.timeMode === formB.timeMode &&
    arraysEqual(formA.agentIds, formB.agentIds) &&
    arraysEqual(formA.daysOfWeek, formB.daysOfWeek) &&
    timesEqual(formA.times, formB.times)
  );
}

/**
 * Encapsulates schedule editor form state with dirty tracking.
 *
 * @param schedule - Existing schedule (undefined for create mode)
 */
export function useScheduleEditorForm(schedule?: Schedule) {
  const [form, setForm] = useState<ScheduleEditorFormState>(DEFAULT_FORM_STATE);
  const initialSnapshot = useRef<ScheduleEditorFormState>(DEFAULT_FORM_STATE);

  useEffect(() => {
    if (!schedule) {
      return;
    }

    const loaded = formStateFromSchedule(schedule);
    setForm(loaded);
    initialSnapshot.current = loaded;
  }, [schedule]);

  const isDirty = !isFormEqual(form, initialSnapshot.current);

  const setName = useCallback((value: string) => setForm((prev) => ({ ...prev, name: value })), []);

  const setMessage = useCallback((value: string) => setForm((prev) => ({ ...prev, message: value })), []);

  const setEnabled = useCallback((value: boolean) => setForm((prev) => ({ ...prev, enabled: value })), []);

  const toggleAgent = useCallback(
    (agentId: string) =>
      setForm((prev) => ({
        ...prev,
        agentIds: prev.agentIds.includes(agentId)
          ? prev.agentIds.filter((selectedId) => selectedId !== agentId)
          : [...prev.agentIds, agentId],
      })),
    []
  );

  const setDaysOfWeek = useCallback((value: DayOfWeek[]) => setForm((prev) => ({ ...prev, daysOfWeek: value })), []);

  const setTimeMode = useCallback(
    (value: TimeModeType) =>
      setForm((prev) => ({
        ...prev,
        timeMode: value,
        // EVERY only uses the first entry; trim excess when switching modes
        times: value === TIME_MODE.EVERY ? [prev.times[0] ?? {}] : prev.times,
      })),
    []
  );

  const setTimes = useCallback(
    (updater: (prev: SchedulerTime[]) => SchedulerTime[]) =>
      setForm((prev) => ({ ...prev, times: updater(prev.times) })),
    []
  );

  return { form, isDirty, setName, setMessage, setEnabled, toggleAgent, setDaysOfWeek, setTimeMode, setTimes };
}
