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
      "List all Google calendars the connected account has access to. Returns each calendar's ID, name (summary), access role (owner, writer, reader, freeBusyReader), IANA timezone, and description when set. The user's primary calendar is flagged separately. Use the calendar ID as input to other calendar tools (e.g. to list or create events on a specific calendar). Access role indicates what the agent can do: 'owner' and 'writer' allow event creation/modification, 'reader' is read-only, and 'freeBusyReader' only exposes busy/free times without event details.",
    inputSchema,
    handler,
  };

  return config;
}
