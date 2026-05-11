import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { DEFAULT_GOOGLE_CALENDAR_ID } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleCalendarEventFull } from "./google-calendar-event-format-utils.js";

export const UPDATE_GOOGLE_CALENDAR_EVENT_TOOL_NAME = "update_google_calendar_event";

export function getUpdateGoogleCalendarEventToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    eventId: z.string().min(1).describe("Event ID from list_google_calendar_events or get_google_calendar_event."),
    title: z.string().optional().describe("New event title."),
    startDateTime: z
      .string()
      .optional()
      .describe(
        "New inclusive start. Must be paired with endDateTime; both must use the same format (date-only YYYY-MM-DD for all-day, or ISO datetime for timed)."
      ),
    endDateTime: z
      .string()
      .optional()
      .describe("New inclusive end. Required when startDateTime is given. For all-day pass the LAST day (inclusive)."),
    description: z.string().optional().describe("New markdown body. Pass an empty string to clear the description."),
    location: z.string().optional().describe("New location. Pass an empty string to clear it."),
    addAttendees: z
      .array(z.string())
      .optional()
      .describe(
        "Email addresses to invite. Already-present attendees are silently skipped; existing attendees keep their RSVP."
      ),
    removeAttendees: z
      .array(z.string())
      .optional()
      .describe("Email addresses to remove from the event. Emails not currently invited are silently skipped."),
    calendarId: z
      .string()
      .optional()
      .describe(`Defaults to "${DEFAULT_GOOGLE_CALENDAR_ID}" (the user's primary calendar) when omitted.`),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const event = await googleClient.updateGoogleCalendarEvent({
        calendarId: args.calendarId,
        eventId: args.eventId,
        title: args.title,
        startDateTime: args.startDateTime,
        endDateTime: args.endDateTime,
        description: args.description,
        location: args.location,
        addAttendees: args.addAttendees,
        removeAttendees: args.removeAttendees,
      });
      return textToolResult(["Event updated.", formatGoogleCalendarEventFull(event)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to update calendar event.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: UPDATE_GOOGLE_CALENDAR_EVENT_TOOL_NAME,
    description:
      "Update fields on an existing Google Calendar event. Only the fields you pass are changed; omitted fields stay as-is. Datetime changes require both startDateTime and endDateTime. Attendee changes use addAttendees / removeAttendees against the current invitee list. Notifications are sent automatically.",
    inputSchema,
    handler,
  };

  return config;
}
