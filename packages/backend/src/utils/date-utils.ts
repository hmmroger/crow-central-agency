import { isNumber, isString } from "es-toolkit";

/** Regex to detect if a datetime string already contains a timezone offset (e.g. +09:00, Z, -05:00) */
const HAS_TIMEZONE_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Format a Date or ISO string as a compact, human-readable local datetime.
 * Example output: "Apr 8, 2026, 3:45 PM"
 *
 * Falls back to ISO string when no timezone is provided.
 */
export function formatLocalDateTime(date: Date | string | number, timezone?: string): string {
  const dateObj = isString(date) || isNumber(date) ? new Date(date) : date;
  if (timezone) {
    return dateObj.toLocaleString("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return dateObj.toISOString();
}

/**
 * Format a Date/epoch as a bare ISO-like local datetime ("YYYY-MM-DDTHH:mm:ss") in
 * the given timezone, with no offset suffix. Pairs with parseDateTimeWithTimezone -
 * a round-trip through it yields the original epoch.
 *
 * Uses the sv-SE locale because it natively produces "YYYY-MM-DD HH:mm:ss" with
 * 24-hour clock and zero-padding, avoiding manual parts assembly.
 */
export function formatLocalIsoDateTime(date: Date | string | number, timezone: string): string {
  const dateObj = isString(date) || isNumber(date) ? new Date(date) : date;
  return dateObj.toLocaleString("sv-SE", { timeZone: timezone }).replace(" ", "T");
}

/**
 * Parse a datetime string, interpreting it in the user's timezone if no offset is present.
 * Agents typically receive datetime hints without an explicit offset, meaning the user's local time.
 *
 * Uses a toLocaleString round-trip to compute the timezone offset:
 * 1. Parse the input as UTC (append "Z") to get a stable reference
 * 2. Format that UTC instant in the user's timezone via toLocaleString
 * 3. Re-parse to find the offset between UTC and the user's local time
 * 4. Subtract the offset to get the correct UTC epoch
 *
 * @param dateTimeStr - Datetime string from the model (e.g. "2025-04-05T14:30:00" or with offset)
 * @param userTimezone - IANA timezone (e.g. "Asia/Tokyo"), used when no offset is present
 * @returns Epoch milliseconds, or NaN if unparseable
 */
export function parseDateTimeWithTimezone(dateTimeStr: string, userTimezone: string): number {
  const trimmed = dateTimeStr.trim();

  if (HAS_TIMEZONE_OFFSET.test(trimmed)) {
    return new Date(trimmed).getTime();
  }

  const asUtc = new Date(`${trimmed}Z`).getTime();
  if (!Number.isFinite(asUtc)) {
    return NaN;
  }

  try {
    // Two round-trips so the server's local timezone cancels out:
    // Both are parsed in server-local time, so the difference is purely the user's UTC offset
    const utcRef = new Date(asUtc);
    const inUserTz = new Date(utcRef.toLocaleString("en-US", { timeZone: userTimezone }));
    const inUtc = new Date(utcRef.toLocaleString("en-US", { timeZone: "UTC" }));
    const offsetMs = inUserTz.getTime() - inUtc.getTime();

    // The user meant the input as their local time, so subtract the offset to get UTC
    return asUtc - offsetMs;
  } catch {
    return NaN;
  }
}
