import type { GoogleCalendar } from "../../services/google/google-client.types.js";

const PRIMARY_SECTION_LABEL = "Primary calendar";
const OTHERS_SECTION_LABEL = "Other calendars";

/**
 * Render the calendar list grouped by primary vs other calendars. Each
 * section is preceded by a `[Label: count]` header; calendars within a
 * section are listed in the order the Calendar API returned them.
 */
export function formatGoogleCalendarList(calendars: GoogleCalendar[]): string {
  if (calendars.length === 0) {
    return "(no calendars)";
  }

  const primary = calendars.filter((calendar) => calendar.primary === true);
  const others = calendars.filter((calendar) => calendar.primary !== true);
  const sections: string[] = [];
  if (primary.length > 0) {
    sections.push(formatGoogleCalendarSection(PRIMARY_SECTION_LABEL, primary));
  }

  if (others.length > 0) {
    sections.push(formatGoogleCalendarSection(OTHERS_SECTION_LABEL, others));
  }

  return sections.join("\n\n");
}

function formatGoogleCalendarSection(label: string, calendars: GoogleCalendar[]): string {
  const lines = [`[${label}: ${calendars.length}]`];
  for (const calendar of calendars) {
    lines.push(`  - ID: ${calendar.id}`);
    lines.push(`    - Name: ${calendar.summary}`);
    lines.push(`    - Access: ${calendar.accessRole}`);
    lines.push(`    - Timezone: ${calendar.timeZone}`);
    if (calendar.description !== undefined && calendar.description.length > 0) {
      lines.push(`    - Description: ${calendar.description}`);
    }
  }

  return lines.join("\n");
}
