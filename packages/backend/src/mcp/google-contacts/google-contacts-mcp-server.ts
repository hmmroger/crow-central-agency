import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_CONTACTS, SCOPE_CONTACTS_OTHER_READONLY } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type {
  McpServerConnectionProfilesFunc,
  McpServerConnectionsFunc,
  McpServerDefinition,
} from "../crow-mcp-manager.types.js";
import { getSearchGoogleContactsToolConfig } from "./search-google-contacts.js";

export const GOOGLE_CONTACTS_MCP_SERVER_NAME = "crow-google-contacts";

export function getGoogleContactsMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
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
    name: GOOGLE_CONTACTS_MCP_SERVER_NAME,
    isConfigurable: true,
    displayName: "Google Contacts",
    hasRequiredConnections,
    getConnectionProfiles,
    getTools: (agentId) => {
      const googleClient = new GoogleClient(connectorManager, sensorManager, agentId);
      return [defineMcpTool(getSearchGoogleContactsToolConfig(googleClient))];
    },
  };
}
