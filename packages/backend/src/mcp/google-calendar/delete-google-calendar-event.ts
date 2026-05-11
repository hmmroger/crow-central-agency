import { z } from "zod";
import type { GoogleClient } from "../../services/google/google-client.js";
import { DEFAULT_GOOGLE_CALENDAR_ID } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_GOOGLE_CALENDAR_EVENT_TOOL_NAME = "delete_google_calendar_event";

export function getDeleteGoogleCalendarEventToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    eventId: z.string().min(1).describe("Event ID from list_google_calendar_events or get_google_calendar_event."),
    calendarId: z
      .string()
      .optional()
      .describe(`Defaults to "${DEFAULT_GOOGLE_CALENDAR_ID}" (the user's primary calendar) when omitted.`),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      await googleClient.deleteGoogleCalendarEvent({
        calendarId: args.calendarId,
        eventId: args.eventId,
      });
      return textToolResult([`Event ${args.eventId} deleted.`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete calendar event.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_GOOGLE_CALENDAR_EVENT_TOOL_NAME,
    description:
      "Permanently cancel and remove a Google Calendar event. Attendees receive cancellation emails automatically. The event ID becomes invalid after this call.",
    inputSchema,
    handler,
  };

  return config;
}
