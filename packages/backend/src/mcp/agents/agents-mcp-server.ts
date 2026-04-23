import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import { getListAgentsToolConfig } from "./list-agents.js";
import { getInvokeAgentToolConfig } from "./invoke-agent.js";

export const CROW_AGENTS_MCP_SERVER_NAME = "crow-agents";

export function createAgentsMcpServer(
  agentId: string,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  taskManager: AgentTaskManager
): McpSdkServerConfigWithInstance {
  const listAgents = getListAgentsToolConfig(agentId, registry);
  const invokeAgent = getInvokeAgentToolConfig(agentId, registry, runtimeManager, taskManager);

  return createSdkMcpServer({
    name: CROW_AGENTS_MCP_SERVER_NAME,
    tools: [
      tool(listAgents.name, listAgents.description, listAgents.inputSchema, listAgents.handler, {
        annotations: listAgents.annotations,
      }),
      tool(invokeAgent.name, invokeAgent.description, invokeAgent.inputSchema, invokeAgent.handler, {
        annotations: invokeAgent.annotations,
      }),
    ],
  });
}
