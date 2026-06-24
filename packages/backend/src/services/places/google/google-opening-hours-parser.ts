import { WEEKDAY, type OpeningHours, type OpeningHoursRange, type Weekday } from "../places-manager.types.js";
import type { GoogleRegularOpeningHours } from "./google-places-adapter.types.js";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** Index 0 = our Monday-based week start; Google's `day` is 0=Sunday-based. */
const WEEKDAY_ORDER: ReadonlyArray<Weekday> = [
  WEEKDAY.MONDAY,
  WEEKDAY.TUESDAY,
  WEEKDAY.WEDNESDAY,
  WEEKDAY.THURSDAY,
  WEEKDAY.FRIDAY,
  WEEKDAY.SATURDAY,
  WEEKDAY.SUNDAY,
];

/**
 * Convert Google `regularOpeningHours` into the provider-neutral
 * {@link OpeningHours}. Google periods use
 * `{open:{day,hour,minute}, close:{day,hour,minute}}` with `day` 0=Sunday;
 * overnight periods carry a `close` on a later day. Each period is split at
 * midnight and binned into a 7-entry MONDAY..SUNDAY table.
 *
 * A single period that opens on day 0 / 00:00 with no `close` means the place
 * is always open. `weekdayDescriptions` (if present) is preserved verbatim as
 * `description` so callers can see anything the structured shape omits.
 */
export function parseGoogleOpeningHours(hours: GoogleRegularOpeningHours | undefined): OpeningHours | undefined {
  const periods = hours?.periods;
  if (!periods || periods.length === 0) {
    return undefined;
  }

  const description = hours?.weekdayDescriptions?.join("; ") || undefined;

  if (isAlwaysOpen(periods)) {
    return {
      alwaysOpen: true,
      weekly: WEEKDAY_ORDER.map((weekday) => ({
        weekday,
        ranges: [{ open: "00:00", close: "24:00" }],
      })),
      description,
    };
  }

  const rangesByWeekday = new Map<Weekday, OpeningHoursRange[]>();
  for (const weekday of WEEKDAY_ORDER) {
    rangesByWeekday.set(weekday, []);
  }

  for (const period of periods) {
    if (!period.close) {
      continue;
    }

    binPeriod(toWeekMinutes(period.open), toWeekMinutes(period.close), rangesByWeekday);
  }

  return {
    alwaysOpen: false,
    weekly: WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      ranges: rangesByWeekday.get(weekday) ?? [],
    })),
    description,
  };
}

function isAlwaysOpen(periods: NonNullable<GoogleRegularOpeningHours["periods"]>): boolean {
  return periods.some(
    (period) => !period.close && period.open.day === 0 && period.open.hour === 0 && period.open.minute === 0
  );
}

function toWeekMinutes(point: { day: number; hour: number; minute: number }): number {
  return point.day * MINUTES_PER_DAY + point.hour * MINUTES_PER_HOUR + point.minute;
}

/**
 * Split an open interval at day boundaries so each slice lands on its starting
 * weekday. Mirrors the OSM parser: a Mon 20:00 -> Tue 02:00 period yields Mon
 * `20:00-24:00` and Tue `00:00-02:00`. A close at or before open is treated as
 * wrapping into the following week.
 */
function binPeriod(openMinute: number, closeMinute: number, rangesByWeekday: Map<Weekday, OpeningHoursRange[]>): void {
  let end = closeMinute;
  if (end <= openMinute) {
    end += MINUTES_PER_WEEK;
  }

  let cursor = openMinute;
  while (cursor < end) {
    const dayStart = Math.floor(cursor / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    const dayEnd = dayStart + MINUTES_PER_DAY;
    const sliceEnd = Math.min(end, dayEnd);
    const weekday = weekdayFromWeekMinute(cursor);
    const range: OpeningHoursRange = {
      open: formatClockTime(cursor - dayStart),
      close: sliceEnd === dayEnd ? "24:00" : formatClockTime(sliceEnd - dayStart),
    };
    const ranges = rangesByWeekday.get(weekday);
    if (ranges) {
      ranges.push(range);
    }

    cursor = sliceEnd;
  }
}

function weekdayFromWeekMinute(weekMinute: number): Weekday {
  const googleDay = Math.floor((weekMinute % MINUTES_PER_WEEK) / MINUTES_PER_DAY);
  const mondayBased = (googleDay + 6) % 7;
  return WEEKDAY_ORDER[mondayBased];
}

function formatClockTime(minuteOfDay: number): string {
  const hours = Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minutes = minuteOfDay % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
