import { formatLocalDateTime } from "../../utils/date-utils.js";

/** Regex to detect if a datetime string already contains a timezone offset (e.g. +09:00, Z, -05:00) */
const HAS_TIMEZONE_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a datetime string, interpreting it in the user's timezone if no offset is present.
 * The model receives datetime with timezone hints and may generate remind_at without an
 * explicit offset, meaning the user's local time.
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

export function formatReminder(
  reminder: { id: string; text: string; remindAt: number },
  userTimezone?: string
): string {
  const remindAtStr = formatLocalDateTime(new Date(reminder.remindAt), userTimezone);

  return [`Reminder ID: ${reminder.id}`, `Text: ${reminder.text}`, `Remind at: ${remindAtStr}`].join("\n");
}
