import OpeningHours from "opening_hours";
import { logger } from "../../../utils/logger.js";
import {
  WEEKDAY,
  type DayOpeningHours,
  type OpeningHours as OpeningHoursModel,
  type OpeningHoursRange,
  type Weekday,
} from "../places-manager.types.js";

const log = logger.child({ context: "osm-opening-hours-parser" });

const WEEKDAY_ORDER: ReadonlyArray<Weekday> = [
  WEEKDAY.MONDAY,
  WEEKDAY.TUESDAY,
  WEEKDAY.WEDNESDAY,
  WEEKDAY.THURSDAY,
  WEEKDAY.FRIDAY,
  WEEKDAY.SATURDAY,
  WEEKDAY.SUNDAY,
];

const ALWAYS_OPEN_RULE = "24/7";

/**
 * Convert an OSM `opening_hours` tag into the provider-neutral
 * {@link OpeningHoursModel}. Uses the `opening_hours` library to handle the
 * full spec (multi-range days, public-holiday rules, seasonal date ranges,
 * sunrise/sunset times) then flattens the *current* week's intervals into a
 * structured weekday table.
 *
 * Seasonal rules (e.g. `Apr-Oct ...`) naturally reflect "what's open this week"
 * because the sample window is anchored to today's local Monday. The raw OSM
 * string is always preserved as `description` so agents can see anything the
 * structured shape cannot express (public holidays, sub-day comments).
 */
export function parseOsmOpeningHours(raw: string | undefined): OpeningHoursModel | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed === ALWAYS_OPEN_RULE) {
    return {
      alwaysOpen: true,
      weekly: WEEKDAY_ORDER.map((weekday) => ({
        weekday,
        ranges: [{ open: "00:00", close: "24:00" }],
      })),
      description: trimmed,
    };
  }

  let parsed: OpeningHours;
  try {
    parsed = new OpeningHours(trimmed);
  } catch (error) {
    log.debug({ error, raw: trimmed }, "Failed to parse OSM opening_hours; surfacing raw string only");
    return { alwaysOpen: false, weekly: emptyWeek(), description: trimmed };
  }

  const start = getCurrentWeekMondayLocal();
  // Construct end via the local-date constructor so DST transitions inside the
  // week do not over- or under-shoot the window (a +7 * 24h raw-ms add lands
  // an hour off during spring-forward/fall-back weeks).
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, 0, 0, 0, 0);
  let intervals: ReturnType<OpeningHours["getOpenIntervals"]>;
  try {
    intervals = parsed.getOpenIntervals(start, end);
  } catch (error) {
    log.debug({ error, raw: trimmed }, "Failed to enumerate opening intervals");
    return { alwaysOpen: false, weekly: emptyWeek(), description: trimmed };
  }

  const rangesByWeekday = new Map<Weekday, OpeningHoursRange[]>();
  for (const weekday of WEEKDAY_ORDER) {
    rangesByWeekday.set(weekday, []);
  }

  for (const interval of intervals) {
    const [intervalStart, intervalEnd, isUnknown] = interval;
    // Unknown-state intervals (e.g. `Mo-Fr 09:00-17:00 unknown "by appointment"`)
    // are not confirmed open times - skip them in the structured shape so callers
    // do not give wrong "is it open" answers. The raw OSM string still carries
    // the nuance through `description`.
    if (isUnknown) {
      continue;
    }

    binInterval(intervalStart, intervalEnd, rangesByWeekday);
  }

  return {
    alwaysOpen: false,
    weekly: WEEKDAY_ORDER.map((weekday) => ({
      weekday,
      ranges: rangesByWeekday.get(weekday) ?? [],
    })),
    description: trimmed,
  };
}

/**
 * Split an open interval at midnight so each piece is anchored to its starting
 * weekday. A `Mo 20:00 - Tu 02:00` rule yields two ranges: Mon `20:00-24:00`
 * and Tue `00:00-02:00`. This matches what callers see in any structured
 * schedule format (Google's `regularOpeningHours.periods` does the same thing).
 */
function binInterval(start: Date, end: Date, rangesByWeekday: Map<Weekday, OpeningHoursRange[]>): void {
  let cursor = start;
  while (cursor < end) {
    const weekday = weekdayFromLocalDate(cursor);
    const dayEnd = startOfNextLocalDay(cursor);
    const sliceEnd = end < dayEnd ? end : dayEnd;
    const range: OpeningHoursRange = {
      open: formatLocalClockTime(cursor),
      close: sliceEnd.getTime() === dayEnd.getTime() ? "24:00" : formatLocalClockTime(sliceEnd),
    };
    const ranges = rangesByWeekday.get(weekday);
    if (ranges) {
      ranges.push(range);
    }

    cursor = sliceEnd;
  }
}

function emptyWeek(): DayOpeningHours[] {
  return WEEKDAY_ORDER.map((weekday) => ({ weekday, ranges: [] }));
}

function getCurrentWeekMondayLocal(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const mondayOffset = (dayOfWeek + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset, 0, 0, 0, 0);
}

function weekdayFromLocalDate(date: Date): Weekday {
  const dayOfWeek = date.getDay();
  const mondayBased = (dayOfWeek + 6) % 7;
  return WEEKDAY_ORDER[mondayBased];
}

function startOfNextLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

function formatLocalClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
