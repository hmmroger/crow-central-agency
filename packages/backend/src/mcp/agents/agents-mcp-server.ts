import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getListAgentsToolConfig } from "./list-agents.js";
import { getInvokeAgentToolConfig } from "./invoke-agent.js";

export const CROW_AGENTS_MCP_SERVER_NAME = "crow-agents";

export function getAgentsMcpServerDefinition(
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  taskManager: AgentTaskManager
): McpServerDefinition {
  return {
    name: CROW_AGENTS_MCP_SERVER_NAME,
    getTools: (agentId) => [
      defineMcpTool(getListAgentsToolConfig(agentId, registry)),
      defineMcpTool(getInvokeAgentToolConfig(agentId, registry, runtimeManager, taskManager)),
    ],
  };
}
