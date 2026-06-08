/**
 * Super-agent MCP server — privileged tools available only to the Crow system agent.
 * Provides tools for inspecting other agents' state and messages.
 */

import { CROW_SYSTEM_AGENT_ID } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { SessionManager } from "../../services/session/session-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getLastAgentMessageToolConfig } from "./get-last-agent-message.js";

export const CROW_SUPER_AGENT_MCP_SERVER_NAME = "crow-super-agent";

export function getSuperAgentMcpServerDefinition(
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  sessionManager: SessionManager
): McpServerDefinition {
  return {
    name: CROW_SUPER_AGENT_MCP_SERVER_NAME,
    allowedAgentIds: [CROW_SYSTEM_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getLastAgentMessageToolConfig(agentId, registry, runtimeManager, sessionManager)),
    ],
  };
}
