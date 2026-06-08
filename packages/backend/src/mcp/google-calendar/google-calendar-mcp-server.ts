import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_CALENDAR_CALENDARLIST_READONLY, SCOPE_CALENDAR_EVENTS } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type {
  McpServerConnectionProfilesFunc,
  McpServerConnectionsFunc,
  McpServerDefinition,
} from "../crow-mcp-manager.types.js";
import { getCreateGoogleCalendarEventToolConfig } from "./create-google-calendar-event.js";
import { getDeleteGoogleCalendarEventToolConfig } from "./delete-google-calendar-event.js";
import { getGetGoogleCalendarEventToolConfig } from "./get-google-calendar-event.js";
import { getListGoogleCalendarEventsToolConfig } from "./list-google-calendar-events.js";
import { getListGoogleCalendarsToolConfig } from "./list-calendars.js";
import { getUpdateGoogleCalendarEventToolConfig } from "./update-google-calendar-event.js";

export const GOOGLE_CALENDAR_MCP_SERVER_NAME = "crow-google-calendar";

export function getGoogleCalendarMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const hasRequiredConnections: McpServerConnectionsFunc = async (agentId) => {
    try {
      const access = await connectorManager.getAccess(agentId, CONNECTOR_ID.GOOGLE);
      if (
        access.grantedScopes.includes(SCOPE_CALENDAR_CALENDARLIST_READONLY) &&
        access.grantedScopes.includes(SCOPE_CALENDAR_EVENTS)
      ) {
        return true;
      }

      return false;
    } catch {
      // not an issue if failed
      return false;
    }
  };

  const getConnectionProfiles: McpServerConnectionProfilesFunc = async (agentId) => {
    try {
      const profile = await connectorManager.getProfile(agentId, CONNECTOR_ID.GOOGLE);
      return {
        [CONNECTOR_ID.GOOGLE]: profile,
      };
    } catch {
      // not an issue if failed
      return undefined;
    }
  };

  return {
    name: GOOGLE_CALENDAR_MCP_SERVER_NAME,
    isConfigurable: true,
    displayName: "Google Calendar",
    hasRequiredConnections,
    getConnectionProfiles,
    getTools: (agentId) => {
      const googleClient = new GoogleClient(connectorManager, sensorManager, agentId);
      return [
        defineMcpTool(getListGoogleCalendarsToolConfig(googleClient)),
        defineMcpTool(getListGoogleCalendarEventsToolConfig(googleClient)),
        defineMcpTool(getGetGoogleCalendarEventToolConfig(googleClient)),
        defineMcpTool(getCreateGoogleCalendarEventToolConfig(googleClient)),
        defineMcpTool(getUpdateGoogleCalendarEventToolConfig(googleClient)),
        defineMcpTool(getDeleteGoogleCalendarEventToolConfig(googleClient)),
      ];
    },
  };
}
