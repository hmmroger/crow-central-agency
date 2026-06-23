import type { CrowMcpManager } from "../crow-mcp-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const LIST_MCP_SERVERS_TOOL_NAME = "list_mcp_servers";

export function getListMcpServersToolConfig(_agentId: string, mcpManager: CrowMcpManager) {
  const inputSchema = {};

  const handler: ToolHandler<typeof inputSchema> = async () => {
    try {
      const servers = mcpManager.getConfigurableMcpServers();
      if (servers.length === 0) {
        return textToolResult(["No MCP servers are available to assign."]);
      }

      const lines = servers.map((server) => {
        const parts = [`${server.displayName} (ID: ${server.id})`];
        if (server.description) {
          parts.push(`- ${server.description}`);
        }

        return `- ${parts.join(" ")}`;
      });

      return textToolResult(["Assignable MCP servers:", ...lines]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list MCP servers.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_MCP_SERVERS_TOOL_NAME,
    description:
      "List the MCP servers you can assign to agents you design. Use a returned id in an agent's mcpServerIds.",
    inputSchema,
    handler,
  };

  return config;
}
