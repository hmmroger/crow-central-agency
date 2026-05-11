import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { DEFAULT_GOOGLE_CALENDAR_ID } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleCalendarEventFull } from "./google-calendar-event-format-utils.js";

export const CREATE_GOOGLE_CALENDAR_EVENT_TOOL_NAME = "create_google_calendar_event";

export function getCreateGoogleCalendarEventToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    title: z.string().min(1).describe("Event title."),
    startDateTime: z
      .string()
      .min(1)
      .describe(
        "Inclusive start. Timed event: datetime (e.g. 2025-05-10T14:00:00), interpreted in the user's local timezone if no offset is present. All-day event: date only (YYYY-MM-DD)."
      ),
    endDateTime: z
      .string()
      .min(1)
      .describe(
        "Inclusive end. Same format as startDateTime — both must use the same format (both datetimes or both dates). For multi-day all-day events, pass the LAST day (inclusive)."
      ),
    description: z.string().optional().describe("Markdown body."),
    location: z.string().optional().describe("Physical address or meeting link."),
    attendees: z
      .array(z.string())
      .optional()
      .describe("Attendee email addresses. Invitation emails are sent automatically when this list is non-empty."),
    addMeetLink: z
      .boolean()
      .optional()
      .describe("Attach a Google Meet video call to the event. The link is returned as hangoutLink on the result."),
    calendarId: z
      .string()
      .optional()
      .describe(`Defaults to "${DEFAULT_GOOGLE_CALENDAR_ID}" (the user's primary calendar) when omitted.`),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const event = await googleClient.createGoogleCalendarEvent({
        calendarId: args.calendarId,
        title: args.title,
        startDateTime: args.startDateTime,
        endDateTime: args.endDateTime,
        description: args.description,
        location: args.location,
        attendees: args.attendees,
        addMeetLink: args.addMeetLink,
      });
      return textToolResult(["Event created.", formatGoogleCalendarEventFull(event)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to create calendar event.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: CREATE_GOOGLE_CALENDAR_EVENT_TOOL_NAME,
    description:
      "Create an event on a Google Calendar. Defaults to the primary calendar. Pass date-only inputs (YYYY-MM-DD) for all-day events or datetime inputs for timed events; both endpoints must match. Description accepts markdown. Attendees, when given, receive Google invitation emails.",
    inputSchema,
    handler,
  };

  return config;
}
