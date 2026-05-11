import { RequestError } from "../../core/error/request-error.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";
import {
  GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE,
  GOOGLE_CALENDAR_EVENT_STATUS,
  GOOGLE_CALENDAR_EVENT_TYPE,
  GOOGLE_SERVICE_NAME,
  type GoogleCalendarEvent,
  type GoogleCalendarEventAttendee,
  type GoogleCalendarEventAttendeeResponse,
  type GoogleCalendarEventStatus,
  type GoogleCalendarEventSummary,
  type GoogleCalendarEventTime,
  type GoogleCalendarEventType,
  type GoogleRawCalendarEvent,
  type GoogleRawCalendarEventAttendee,
  type GoogleRawCalendarEventTime,
} from "./google-client.types.js";
import { htmlToMarkdown } from "./html-to-markdown.js";

export function parseGoogleCalendarEventSummary(
  raw: GoogleRawCalendarEvent,
  userTimezone: string
): GoogleCalendarEventSummary {
  const summary: GoogleCalendarEventSummary = {
    id: raw.id,
    status: parseStatus(raw.status),
    eventType: parseEventType(raw.eventType),
    start: parseEventTime(raw.start, userTimezone),
    end: parseEventTime(raw.end, userTimezone),
    isRecurringInstance: raw.recurringEventId !== undefined,
    attendeeCount: raw.attendees?.length ?? 0,
  };
  if (raw.summary !== undefined) {
    summary.summary = raw.summary;
  }

  if (raw.location !== undefined) {
    summary.location = raw.location;
  }

  if (raw.organizer?.email !== undefined) {
    summary.organizerEmail = raw.organizer.email;
  }

  if (raw.htmlLink !== undefined) {
    summary.htmlLink = raw.htmlLink;
  }

  return summary;
}

export function parseGoogleCalendarEventFull(raw: GoogleRawCalendarEvent, userTimezone: string): GoogleCalendarEvent {
  const event: GoogleCalendarEvent = parseGoogleCalendarEventSummary(raw, userTimezone);
  if (raw.description !== undefined) {
    event.description = htmlToMarkdown(raw.description);
  }

  if (raw.attendees !== undefined && raw.attendees.length > 0) {
    event.attendees = raw.attendees.map(parseAttendee);
  }

  if (raw.hangoutLink !== undefined) {
    event.hangoutLink = raw.hangoutLink;
  }

  if (raw.recurringEventId !== undefined) {
    event.recurringEventId = raw.recurringEventId;
  }

  return event;
}

function parseEventTime(raw: GoogleRawCalendarEventTime, userTimezone: string): GoogleCalendarEventTime {
  if (raw.date !== undefined) {
    const time: GoogleCalendarEventTime = {
      raw: raw.date,
      display: raw.date,
      isAllDay: true,
    };
    if (raw.timeZone !== undefined) {
      time.timeZone = raw.timeZone;
    }

    return time;
  }

  if (raw.dateTime === undefined) {
    throw new RequestError(
      "Calendar event time has neither date nor dateTime fields.",
      undefined,
      undefined,
      GOOGLE_SERVICE_NAME
    );
  }

  const time: GoogleCalendarEventTime = {
    raw: raw.dateTime,
    display: formatLocalDateTime(raw.dateTime, userTimezone),
    isAllDay: false,
  };
  if (raw.timeZone !== undefined) {
    time.timeZone = raw.timeZone;
  }

  return time;
}

function parseAttendee(raw: GoogleRawCalendarEventAttendee): GoogleCalendarEventAttendee {
  const attendee: GoogleCalendarEventAttendee = {
    email: raw.email,
    responseStatus: parseAttendeeResponse(raw.responseStatus),
  };
  if (raw.displayName !== undefined) {
    attendee.displayName = raw.displayName;
  }

  if (raw.optional === true) {
    attendee.optional = true;
  }

  if (raw.organizer === true) {
    attendee.organizer = true;
  }

  if (raw.self === true) {
    attendee.self = true;
  }

  return attendee;
}

function isGoogleCalendarEventStatus(value: string): value is GoogleCalendarEventStatus {
  return (
    value === GOOGLE_CALENDAR_EVENT_STATUS.CONFIRMED ||
    value === GOOGLE_CALENDAR_EVENT_STATUS.TENTATIVE ||
    value === GOOGLE_CALENDAR_EVENT_STATUS.CANCELLED
  );
}

function parseStatus(raw: string | undefined): GoogleCalendarEventStatus {
  // Google's documented values are confirmed/tentative/cancelled. Default to confirmed
  // for missing/unknown values since confirmed is the typical state for active events.
  if (raw !== undefined && isGoogleCalendarEventStatus(raw)) {
    return raw;
  }

  return GOOGLE_CALENDAR_EVENT_STATUS.CONFIRMED;
}

function isGoogleCalendarEventType(value: string): value is GoogleCalendarEventType {
  return (
    value === GOOGLE_CALENDAR_EVENT_TYPE.DEFAULT ||
    value === GOOGLE_CALENDAR_EVENT_TYPE.OUT_OF_OFFICE ||
    value === GOOGLE_CALENDAR_EVENT_TYPE.FOCUS_TIME ||
    value === GOOGLE_CALENDAR_EVENT_TYPE.WORKING_LOCATION ||
    value === GOOGLE_CALENDAR_EVENT_TYPE.BIRTHDAY ||
    value === GOOGLE_CALENDAR_EVENT_TYPE.FROM_GMAIL
  );
}

function parseEventType(raw: string | undefined): GoogleCalendarEventType {
  if (raw !== undefined && isGoogleCalendarEventType(raw)) {
    return raw;
  }

  return GOOGLE_CALENDAR_EVENT_TYPE.DEFAULT;
}

function isGoogleCalendarEventAttendeeResponse(value: string): value is GoogleCalendarEventAttendeeResponse {
  return (
    value === GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.NEEDS_ACTION ||
    value === GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.DECLINED ||
    value === GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.TENTATIVE ||
    value === GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.ACCEPTED
  );
}

function parseAttendeeResponse(raw: string | undefined): GoogleCalendarEventAttendeeResponse {
  if (raw !== undefined && isGoogleCalendarEventAttendeeResponse(raw)) {
    return raw;
  }

  return GOOGLE_CALENDAR_EVENT_ATTENDEE_RESPONSE.NEEDS_ACTION;
}
