import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ConnectorManager } from "../../connectors/connector-manager.js";
import { CONNECTOR_ID } from "../../connectors/connector-manager.types.js";
import { SCOPE_GMAIL_MODIFY } from "../../connectors/google-connector.js";
import { GoogleClient } from "../../services/google/google-client.js";
import type { McpServerConnectionsFunc, McpServerDefinition, McpServerFactory } from "../crow-mcp-manager.types.js";
import { getListGmailMessagesToolConfig } from "./list-gmail-messages.js";

export const GMAIL_MCP_SERVER_NAME = "crow-gmail";

export function createGmailMcpServer(googleClient: GoogleClient): McpSdkServerConfigWithInstance {
  const listGmailMessages = getListGmailMessagesToolConfig(googleClient);

  return createSdkMcpServer({
    name: GMAIL_MCP_SERVER_NAME,
    tools: [
      tool(
        listGmailMessages.name,
        listGmailMessages.description,
        listGmailMessages.inputSchema,
        listGmailMessages.handler,
        {
          annotations: listGmailMessages.annotations,
        }
      ),
    ],
  });
}

export function getGmailMcpServerDefinition(connectorManager: ConnectorManager): McpServerDefinition {
  const serverFactory: McpServerFactory = (agentId) =>
    createGmailMcpServer(new GoogleClient(connectorManager, agentId));
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
