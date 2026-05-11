import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { DEFAULT_GOOGLE_CALENDAR_ID } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleCalendarEventFull } from "./google-calendar-event-format-utils.js";

export const GET_GOOGLE_CALENDAR_EVENT_TOOL_NAME = "get_google_calendar_event";

export function getGetGoogleCalendarEventToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    eventId: z
      .string()
      .min(1)
      .describe("Event ID from list_google_calendar_events (or another tool that returned events)."),
    calendarId: z
      .string()
      .optional()
      .describe(
        `Calendar the event belongs to. Defaults to "${DEFAULT_GOOGLE_CALENDAR_ID}" (the user's primary calendar) when omitted. If the event was returned by list_google_calendar_events against a non-primary calendar, pass that same calendarId here.`
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const event = await googleClient.getGoogleCalendarEvent({
        eventId: args.eventId,
        calendarId: args.calendarId,
      });
      return textToolResult([formatGoogleCalendarEventFull(event)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to fetch calendar event.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_GOOGLE_CALENDAR_EVENT_TOOL_NAME,
    description:
      "Fetch full details for one calendar event, including description and per-attendee response status. Defaults to the primary calendar; pass calendarId when the event came from a different calendar.",
    inputSchema,
    handler,
  };

  return config;
}
