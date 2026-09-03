import { TIME_MODE, type DayOfWeek, type SchedulerTime, type TimeModeType } from "@crow-central-agency/shared";
import { DAY_LABELS, WEEK_ORDER } from "./day-of-week-display.js";

/** The "when" fields of a schedule, as held by both a saved schedule and the editor form. */
export interface ScheduleTiming {
  timeMode: TimeModeType;
  times: SchedulerTime[];
  daysOfWeek: DayOfWeek[];
}

/** Shortest run length rendered as a range rather than a comma list */
const MIN_RUN_LENGTH_FOR_RANGE = 3;

const DAY_SEPARATOR = " · ";

const NO_TIMING_LABEL = "Not scheduled";

/** Pad an hour or minute to two digits */
function padTimeUnit(value: number): string {
  return String(value).padStart(2, "0");
}

/** "14:30", "09:00" for an hour-bearing entry, ":05" for a minute-only hourly entry */
function formatAtTime(time: SchedulerTime): string | undefined {
  if (time.hour !== undefined) {
    return `${padTimeUnit(time.hour)}:${padTimeUnit(time.minute ?? 0)}`;
  }

  if (time.minute !== undefined) {
    return `:${padTimeUnit(time.minute)}`;
  }

  return undefined;
}

/** "1h 30m", "30m", "1h" — undefined when the entry carries no interval */
function formatInterval(time: SchedulerTime | undefined): string | undefined {
  if (!time) {
    return undefined;
  }

  const segments: string[] = [];
  if (time.hour) {
    segments.push(`${time.hour}h`);
  }

  if (time.minute) {
    segments.push(`${time.minute}m`);
  }

  return segments.length > 0 ? segments.join(" ") : undefined;
}

/** Group the selected days into contiguous week-order runs */
function groupContiguousDays(daysOfWeek: DayOfWeek[]): DayOfWeek[][] {
  const runs: DayOfWeek[][] = [];
  let currentRun: DayOfWeek[] = [];

  for (const day of WEEK_ORDER) {
    if (daysOfWeek.includes(day)) {
      currentRun.push(day);
      continue;
    }

    if (currentRun.length > 0) {
      runs.push(currentRun);
      currentRun = [];
    }
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
}

/** "Mon–Fri", "Mon, Wed, Fri", "Mon–Wed, Fri" — undefined when every day is allowed */
export function formatScheduleDays(daysOfWeek: DayOfWeek[]): string | undefined {
  if (daysOfWeek.length === 0) {
    return undefined;
  }

  const runs = groupContiguousDays(daysOfWeek);
  const labels = runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    if (first && last && run.length >= MIN_RUN_LENGTH_FOR_RANGE) {
      return `${DAY_LABELS[first]}–${DAY_LABELS[last]}`;
    }

    return run.map((day) => DAY_LABELS[day]).join(", ");
  });

  return labels.join(", ");
}

/** Timing sentence without the day segment */
function formatTimes(timing: ScheduleTiming): string | undefined {
  if (timing.timeMode === TIME_MODE.EVERY) {
    const interval = formatInterval(timing.times[0]);

    return interval ? `Every ${interval}` : undefined;
  }

  const formatted = timing.times.map(formatAtTime).filter((time) => time !== undefined);
  if (formatted.length === 0) {
    return undefined;
  }

  const isHourlyMinuteOnly = timing.times.every((time) => time.hour === undefined);

  return isHourlyMinuteOnly ? `At ${formatted.join(", ")} every hour` : `At ${formatted.join(", ")}`;
}

/**
 * Render a schedule's timing as a short sentence, e.g. "Every 30m" or
 * "At 09:00, 17:00 · Mon–Fri". Presentation only — never a next-run time.
 */
export function formatScheduleTiming(timing: ScheduleTiming): string {
  const times = formatTimes(timing);
  if (!times) {
    return NO_TIMING_LABEL;
  }

  const days = formatScheduleDays(timing.daysOfWeek);

  return days ? `${times}${DAY_SEPARATOR}${days}` : times;
}
