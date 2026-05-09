import { formatLocalDateTime } from "../../utils/date-utils.js";

export function formatReminder(
  reminder: { id: string; text: string; remindAt: number },
  userTimezone?: string
): string {
  const remindAtStr = formatLocalDateTime(new Date(reminder.remindAt), userTimezone);

  return [`Reminder ID: ${reminder.id}`, `Text: ${reminder.text}`, `Remind at: ${remindAtStr}`].join("\n");
}
