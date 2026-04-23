import type { AgentRegistry } from "../../services/agent-registry.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const LIST_AGENTS_TOOL_NAME = "list_agents";

export function getListAgentsToolConfig(agentId: string, registry: AgentRegistry) {
  const inputSchema = {};

  const handler: ToolHandler<typeof inputSchema> = async () => {
    try {
      const agents = registry.getPeerAgents(agentId);
      if (agents.length === 0) {
        return textToolResult(["No agents are currently registered."]);
      }

      const lines = agents.map((agent) => {
        const parts = [`${agent.name} (ID: ${agent.id})`];
        if (agent.description) {
          parts.push(`- ${agent.description}`);
        }

        return `- ${parts.join(" ")}`;
      });

      return textToolResult([`Available agents:`, ...lines]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to list agents.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_AGENTS_TOOL_NAME,
    description:
      "List all registered agents with their IDs, names, and role descriptions. Use this to discover which agents are available for collaboration.",
    inputSchema,
    handler,
  };

  return config;
}
