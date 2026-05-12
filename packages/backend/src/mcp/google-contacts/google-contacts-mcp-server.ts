import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_CONTACTS, SCOPE_CONTACTS_OTHER_READONLY } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import type {
  McpServerConnectionProfilesFunc,
  McpServerConnectionsFunc,
  McpServerDefinition,
  McpServerFactory,
} from "../crow-mcp-manager.types.js";
import { getSearchGoogleContactsToolConfig } from "./search-google-contacts.js";

export const GOOGLE_CONTACTS_MCP_SERVER_NAME = "crow-google-contacts";

export function createGoogleContactsMcpServer(googleClient: GoogleClient): McpSdkServerConfigWithInstance {
  const searchContacts = getSearchGoogleContactsToolConfig(googleClient);

  return createSdkMcpServer({
    name: GOOGLE_CONTACTS_MCP_SERVER_NAME,
    tools: [
      tool(searchContacts.name, searchContacts.description, searchContacts.inputSchema, searchContacts.handler, {
        annotations: searchContacts.annotations,
      }),
    ],
  });
}

export function getGoogleContactsMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const serverFactory: McpServerFactory = (agentId) =>
    createGoogleContactsMcpServer(new GoogleClient(connectorManager, sensorManager, agentId));
  const hasRequiredConnections: McpServerConnectionsFunc = async (agentId) => {
    try {
      const access = await connectorManager.getAccess(agentId, CONNECTOR_ID.GOOGLE);
      if (
        access.grantedScopes.includes(SCOPE_CONTACTS) &&
        access.grantedScopes.includes(SCOPE_CONTACTS_OTHER_READONLY)
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
    serverFactory,
    hasRequiredConnections,
    getConnectionProfiles,
    isConfigurable: true,
    displayName: "Google Contacts",
  };
}
