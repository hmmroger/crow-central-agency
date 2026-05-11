import { z } from "zod";
import { DEFAULT_GOOGLE_CALENDAR_EVENTS_LIST_LIMIT, type GoogleClient } from "../../services/google/google-client.js";
import { DEFAULT_GOOGLE_CALENDAR_ID } from "../../services/google/google-client.types.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleCalendarEventSummary } from "./google-calendar-event-format-utils.js";

const MAX_GOOGLE_CALENDAR_EVENTS_LIMIT = 100;

export const LIST_GOOGLE_CALENDAR_EVENTS_TOOL_NAME = "list_google_calendar_events";

export function getListGoogleCalendarEventsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {
    calendarId: z
      .string()
      .optional()
      .describe(
        `Calendar to query. Use IDs from list_google_calendars. Defaults to "${DEFAULT_GOOGLE_CALENDAR_ID}" (the user's primary calendar) when omitted.`
      ),
    startDateTime: z
      .string()
      .optional()
      .describe(
        "Inclusive lower bound in datetime format (e.g. 2025-05-10T09:00:00). Interpreted in the user's local timezone if no offset is present. Defaults to the current time when omitted."
      ),
    endDateTime: z
      .string()
      .optional()
      .describe(
        "Exclusive upper bound in datetime format (e.g. 2025-05-17T18:00:00). Interpreted in the user's local timezone if no offset is present."
      ),
    contains: z
      .string()
      .optional()
      .describe("Free-text search matched across event title, description, location, and attendee names/emails."),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_GOOGLE_CALENDAR_EVENTS_LIMIT)
      .optional()
      .describe(
        `Number of events to return per page (default: ${DEFAULT_GOOGLE_CALENDAR_EVENTS_LIST_LIMIT}, max: ${MAX_GOOGLE_CALENDAR_EVENTS_LIMIT}).`
      ),
    pageToken: z.string().optional().describe("Token from a previous response's nextPageToken to fetch the next page."),
  };

  const handler: ToolHandler<typeof inputSchema> = async (args) => {
    try {
      const result = await googleClient.listGoogleCalendarEvents({
        calendarId: args.calendarId,
        startDateTime: args.startDateTime,
        endDateTime: args.endDateTime,
        contains: args.contains,
        limit: args.limit ?? DEFAULT_GOOGLE_CALENDAR_EVENTS_LIST_LIMIT,
        pageToken: args.pageToken,
      });
      if (result.events.length === 0) {
        return textToolResult(["No events found."]);
      }

      const headerLines = [`[Calendar events: ${result.events.length}]`];
      if (result.nextPageToken !== undefined) {
        headerLines.push(`[More available: pass pageToken="${result.nextPageToken}" for next page]`);
      }

      const body = result.events.map(formatGoogleCalendarEventSummary).join("\n");
      return textToolResult([...headerLines, body]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list calendar events.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_GOOGLE_CALENDAR_EVENTS_TOOL_NAME,
    description:
      "List events on a Google Calendar. Defaults to the primary calendar and to upcoming events only (startDateTime defaults to now - pass it explicitly for past events). Recurring events are expanded into chronologically-ordered instances. Use list_google_calendars for non-primary calendar IDs, and get_google_calendar_event for full event details.",
    inputSchema,
    handler,
  };

  return config;
}
