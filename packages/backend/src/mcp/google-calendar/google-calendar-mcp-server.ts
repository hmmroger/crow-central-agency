import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_CALENDAR_CALENDARLIST_READONLY, SCOPE_CALENDAR_EVENTS } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import type { McpServerConnectionsFunc, McpServerDefinition, McpServerFactory } from "../crow-mcp-manager.types.js";
import { getGetGoogleCalendarEventToolConfig } from "./get-google-calendar-event.js";
import { getListGoogleCalendarEventsToolConfig } from "./list-google-calendar-events.js";
import { getListGoogleCalendarsToolConfig } from "./list-calendars.js";

export const GOOGLE_CALENDAR_MCP_SERVER_NAME = "crow-google-calendar";

export function createGoogleCalendarMcpServer(googleClient: GoogleClient): McpSdkServerConfigWithInstance {
  const listCalendars = getListGoogleCalendarsToolConfig(googleClient);
  const listEvents = getListGoogleCalendarEventsToolConfig(googleClient);
  const getEvent = getGetGoogleCalendarEventToolConfig(googleClient);

  return createSdkMcpServer({
    name: GOOGLE_CALENDAR_MCP_SERVER_NAME,
    tools: [
      tool(listCalendars.name, listCalendars.description, listCalendars.inputSchema, listCalendars.handler, {
        annotations: listCalendars.annotations,
      }),
      tool(listEvents.name, listEvents.description, listEvents.inputSchema, listEvents.handler, {
        annotations: listEvents.annotations,
      }),
      tool(getEvent.name, getEvent.description, getEvent.inputSchema, getEvent.handler, {
        annotations: getEvent.annotations,
      }),
    ],
  });
}

export function getGoogleCalendarMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const serverFactory: McpServerFactory = (agentId) =>
    createGoogleCalendarMcpServer(new GoogleClient(connectorManager, sensorManager, agentId));
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

  return {
    serverFactory,
    hasRequiredConnections,
    isConfigurable: true,
    displayName: "Google Calendar",
  };
}
