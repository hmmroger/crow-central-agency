import {
  GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE,
  GOOGLE_CALENDAR_EVENT_TYPE,
  type GoogleCalendarEvent,
  type GoogleCalendarEventAttendee,
  type GoogleCalendarEventSummary,
  type GoogleCalendarEventTime,
} from "../../services/google/google-client.types.js";

const ATTENDEE_RESPONSE_LABEL: Record<string, string> = {
  [GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.NEEDS_ACTION]: "no response",
  [GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.DECLINED]: "declined",
  [GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.TENTATIVE]: "tentative",
  [GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.ACCEPTED]: "accepted",
};

/** One-event summary block used for both list and get tool output. */
export function formatGoogleCalendarEventSummary(event: GoogleCalendarEventSummary): string {
  const lines = [
    `  - ID: ${event.id}`,
    `    - Title: ${event.summary ?? "(no title)"}`,
    `    - Status: ${event.status}`,
    `    - Start: ${formatEventTime(event.start)}`,
    `    - End: ${formatEventTime(event.end)}`,
  ];

  // Default events are the common case - skip the line to keep output lean.
  if (event.eventType !== GOOGLE_CALENDAR_EVENT_TYPE.DEFAULT) {
    lines.push(`    - Event type: ${event.eventType}`);
  }

  if (event.location !== undefined && event.location.length > 0) {
    lines.push(`    - Location: ${event.location}`);
  }

  if (event.organizerEmail !== undefined) {
    lines.push(`    - Organizer: ${event.organizerEmail}`);
  }

  if (event.attendeeCount > 0) {
    lines.push(`    - Attendees: ${event.attendeeCount}`);
  }

  if (event.isRecurringInstance) {
    lines.push("    - Recurring: yes (instance of a series)");
  }

  if (event.htmlLink !== undefined) {
    lines.push(`    - Link: ${event.htmlLink}`);
  }

  return lines.join("\n");
}

/** Full-event block including description and per-attendee response status. */
export function formatGoogleCalendarEventFull(event: GoogleCalendarEvent): string {
  const lines = [formatGoogleCalendarEventSummary(event)];
  if (event.hangoutLink !== undefined) {
    lines.push(`    - Meet link: ${event.hangoutLink}`);
  }

  if (event.recurringEventId !== undefined) {
    lines.push(`    - Recurring series ID: ${event.recurringEventId}`);
  }

  if (event.description !== undefined && event.description.length > 0) {
    lines.push("    - Description:");
    for (const descriptionLine of event.description.split(/\r?\n/)) {
      lines.push(`        ${descriptionLine}`);
    }
  }

  if (event.attendees !== undefined && event.attendees.length > 0) {
    lines.push(`    - Attendee list (${event.attendees.length}):`);
    for (const attendee of event.attendees) {
      lines.push(`        - ${formatAttendee(attendee)}`);
    }
  }

  return lines.join("\n");
}

function formatEventTime(time: GoogleCalendarEventTime): string {
  if (time.isAllDay) {
    return `${time.display} (all day)`;
  }

  if (time.timeZone !== undefined) {
    return `${time.display} (${time.timeZone})`;
  }

  return time.display;
}

function formatAttendee(attendee: GoogleCalendarEventAttendee): string {
  const name = attendee.displayName !== undefined ? `${attendee.displayName} <${attendee.email}>` : attendee.email;
  const flags: string[] = [ATTENDEE_RESPONSE_LABEL[attendee.responseStatus] ?? attendee.responseStatus];
  if (attendee.optional === true) {
    flags.push("optional");
  }

  if (attendee.organizer === true) {
    flags.push("organizer");
  }

  if (attendee.self === true) {
    flags.push("self");
  }

  return `${name} [${flags.join(", ")}]`;
}
