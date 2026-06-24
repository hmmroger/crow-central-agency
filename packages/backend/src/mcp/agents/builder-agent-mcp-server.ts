/**
 * Builder-agent MCP server — read-only perception tools available only to the World Builder.
 * Lets the World Builder survey existing agents and assignable MCP servers before designing a fleet.
 */

import { CROW_WORLD_BUILDER_AGENT_ID } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { CrowMcpManager } from "../crow-mcp-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListAgentsToolConfig } from "./list-agents.js";
import { getAgentDetailsToolConfig } from "./get-agent-details.js";
import { getListMcpServersToolConfig } from "./list-mcp-servers.js";

export const CROW_BUILDER_AGENT_MCP_SERVER_NAME = "crow-builder-agent";

export function getBuilderAgentMcpServerDefinition(
  registry: AgentRegistry,
  mcpManager: CrowMcpManager
): McpServerDefinition {
  return {
    name: CROW_BUILDER_AGENT_MCP_SERVER_NAME,
    allowedAgentIds: [CROW_WORLD_BUILDER_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getListAgentsToolConfig(agentId, registry)),
      defineMcpTool(getAgentDetailsToolConfig(agentId, registry, mcpManager)),
      defineMcpTool(getListMcpServersToolConfig(agentId, mcpManager)),
    ],
  };
}
