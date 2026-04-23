import { isNumber, isString } from "es-toolkit";

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
