import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_GMAIL_MODIFY } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type {
  McpServerConnectionProfilesFunc,
  McpServerConnectionsFunc,
  McpServerDefinition,
} from "../crow-mcp-manager.types.js";
import { getCreateGmailDraftToolConfig } from "./create-gmail-draft.js";
import { getCreateGmailUserLabelToolConfig } from "./create-gmail-user-label.js";
import { getDeleteGmailDraftToolConfig } from "./delete-gmail-draft.js";
import { getDeleteGmailUserLabelToolConfig } from "./delete-gmail-user-label.js";
import { getGetGmailMessageContentToolConfig } from "./get-gmail-message-content.js";
import { getGetGmailThreadToolConfig } from "./get-gmail-thread.js";
import { getListGmailDraftsToolConfig } from "./list-gmail-drafts.js";
import { getListGmailLabelsToolConfig } from "./list-gmail-labels.js";
import { getListGmailMessagesToolConfig } from "./list-gmail-messages.js";
import { getMoveGmailMessageToTrashToolConfig } from "./move-gmail-message-to-trash.js";
import { getReplyToGmailMessageToolConfig } from "./reply-to-gmail-message.js";
import { getSendGmailDraftToolConfig } from "./send-gmail-draft.js";
import { getSendGmailMessageToolConfig } from "./send-gmail-message.js";
import { getUpdateGmailDraftToolConfig } from "./update-gmail-draft.js";
import { getUpdateGmailMessageStateToolConfig } from "./update-gmail-message-state.js";
import { getUpdateGmailMessageUserLabelsToolConfig } from "./update-gmail-message-user-labels.js";

export const GMAIL_MCP_SERVER_NAME = "crow-gmail";

export function getGmailMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const hasRequiredConnections: McpServerConnectionsFunc = async (agentId) => {
    try {
      const access = await connectorManager.getAccess(agentId, CONNECTOR_ID.GOOGLE);
      if (!access.grantedScopes.includes(SCOPE_GMAIL_MODIFY)) {
        return false;
      }

      return true;
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
    name: GMAIL_MCP_SERVER_NAME,
    isConfigurable: true,
    displayName: "Gmail",
    hasRequiredConnections,
    getConnectionProfiles,
    getTools: (agentId) => {
      const googleClient = new GoogleClient(connectorManager, sensorManager, agentId);
      return [
        defineMcpTool(getListGmailMessagesToolConfig(googleClient)),
        defineMcpTool(getGetGmailMessageContentToolConfig(googleClient)),
        defineMcpTool(getGetGmailThreadToolConfig(googleClient)),
        defineMcpTool(getSendGmailMessageToolConfig(googleClient)),
        defineMcpTool(getReplyToGmailMessageToolConfig(googleClient)),
        defineMcpTool(getMoveGmailMessageToTrashToolConfig(googleClient)),
        defineMcpTool(getListGmailLabelsToolConfig(googleClient)),
        defineMcpTool(getUpdateGmailMessageUserLabelsToolConfig(googleClient)),
        defineMcpTool(getUpdateGmailMessageStateToolConfig(googleClient)),
        defineMcpTool(getCreateGmailUserLabelToolConfig(googleClient)),
        defineMcpTool(getDeleteGmailUserLabelToolConfig(googleClient)),
        defineMcpTool(getCreateGmailDraftToolConfig(googleClient)),
        defineMcpTool(getUpdateGmailDraftToolConfig(googleClient)),
        defineMcpTool(getSendGmailDraftToolConfig(googleClient)),
        defineMcpTool(getDeleteGmailDraftToolConfig(googleClient)),
        defineMcpTool(getListGmailDraftsToolConfig(googleClient)),
      ];
    },
  };
}
