/**
 * Super-agent MCP server — privileged tools available only to the Crow system agent.
 * Provides tools for inspecting other agents' state and messages.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { SessionManager } from "../../services/session/session-manager.js";
import { getLastAgentMessageToolConfig } from "./get-last-agent-message.js";

export const CROW_SUPER_AGENT_MCP_SERVER_NAME = "crow-super-agent";

export function createSuperAgentMcpServer(
  agentId: string,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  sessionManager: SessionManager
): McpSdkServerConfigWithInstance {
  const getLastAgentMessage = getLastAgentMessageToolConfig(agentId, registry, runtimeManager, sessionManager);

  return createSdkMcpServer({
    name: CROW_SUPER_AGENT_MCP_SERVER_NAME,
    tools: [
      tool(
        getLastAgentMessage.name,
        getLastAgentMessage.description,
        getLastAgentMessage.inputSchema,
        getLastAgentMessage.handler,
        { annotations: getLastAgentMessage.annotations }
      ),
    ],
  });
}
