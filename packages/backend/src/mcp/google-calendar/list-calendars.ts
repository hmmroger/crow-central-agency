import type { GoogleClient } from "../../services/google/google-client.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatGoogleCalendarList } from "./google-calendar-format-utils.js";

export const LIST_GOOGLE_CALENDARS_TOOL_NAME = "list_google_calendars";

export function getListGoogleCalendarsToolConfig(googleClient: GoogleClient) {
  const inputSchema = {};

  const handler: ToolHandler<typeof inputSchema> = async () => {
    try {
      const result = await googleClient.listGoogleCalendars();
      if (result.calendars.length === 0) {
        return textToolResult(["No calendars found."]);
      }

      return textToolResult([formatGoogleCalendarList(result.calendars)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list Google calendars.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_GOOGLE_CALENDARS_TOOL_NAME,
    description:
      "List Google calendars the connected account can access. Use this to discover calendar IDs for the other calendar tools; the primary calendar is flagged. Access roles ('owner'/'writer' allow event modification, 'reader' is read-only, 'freeBusyReader' exposes only busy/free).",
    inputSchema,
    handler,
  };

  return config;
}
