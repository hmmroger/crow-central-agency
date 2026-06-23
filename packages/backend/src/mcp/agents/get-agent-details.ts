import { z } from "zod";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { CrowMcpManager } from "../crow-mcp-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const GET_AGENT_DETAILS_TOOL_NAME = "get_agent_details";

export function getAgentDetailsToolConfig(_agentId: string, registry: AgentRegistry, mcpManager: CrowMcpManager) {
  const inputSchema = {
    agent_id: z.string().describe("The ID of the agent to inspect. Use list_agents to find IDs."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agent_id }) => {
    try {
      const details = await registry.getAgentDetails(agent_id);

      const mcpServerNames = details.mcpServerIds.map((id) => mcpManager.getMcpServerDisplayName(id) ?? id);

      const lines = [
        `${details.name} (ID: ${details.id})`,
        `Description: ${details.description ?? "(none)"}`,
        `Workspace: ${details.workspace ?? "(default)"}`,
        `Circles: ${details.circles.length ? details.circles.join(", ") : "(none)"}`,
        `Assigned MCP servers: ${mcpServerNames.length ? mcpServerNames.join(", ") : "(none)"}`,
        `Has AGENT.md: ${details.hasAgentMd ? "yes" : "no"}`,
        "",
        "Persona:",
        details.persona ?? "(none)",
      ];

      return textToolResult(lines);
    } catch (error) {
      return getErrorToolResult(error, `Agent not found: ${agent_id}`);
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_AGENT_DETAILS_TOOL_NAME,
    description:
      "Get the design profile of one existing agent — persona, description, workspace, circles, assigned MCP servers, and whether it has an AGENT.md. Use after list_agents to study an agent before designing around it.",
    inputSchema,
    handler,
  };

  return config;
}
