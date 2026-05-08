import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_GMAIL_MODIFY } from "../../connectors/google-connector.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { GoogleClient } from "../../services/google/google-client.js";
import type { McpServerConnectionsFunc, McpServerDefinition, McpServerFactory } from "../crow-mcp-manager.types.js";
import { getGetGmailMessageContentToolConfig } from "./get-gmail-message-content.js";
import { getGetGmailThreadToolConfig } from "./get-gmail-thread.js";
import { getListGmailMessagesToolConfig } from "./list-gmail-messages.js";

export const GMAIL_MCP_SERVER_NAME = "crow-gmail";

export function createGmailMcpServer(googleClient: GoogleClient): McpSdkServerConfigWithInstance {
  const listMessages = getListGmailMessagesToolConfig(googleClient);
  const getMessageContent = getGetGmailMessageContentToolConfig(googleClient);
  const getThread = getGetGmailThreadToolConfig(googleClient);

  return createSdkMcpServer({
    name: GMAIL_MCP_SERVER_NAME,
    tools: [
      tool(listMessages.name, listMessages.description, listMessages.inputSchema, listMessages.handler, {
        annotations: listMessages.annotations,
      }),
      tool(
        getMessageContent.name,
        getMessageContent.description,
        getMessageContent.inputSchema,
        getMessageContent.handler,
        { annotations: getMessageContent.annotations }
      ),
      tool(getThread.name, getThread.description, getThread.inputSchema, getThread.handler, {
        annotations: getThread.annotations,
      }),
    ],
  });
}

export function getGmailMcpServerDefinition(
  connectorManager: ConnectorManager,
  sensorManager: SensorManager
): McpServerDefinition {
  const serverFactory: McpServerFactory = (agentId) =>
    createGmailMcpServer(new GoogleClient(connectorManager, sensorManager, agentId));
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

  return {
    serverFactory,
    hasRequiredConnections,
    isConfigurable: true,
    displayName: "Gmail",
  };
}
