import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  FRAGMENT_REFLECTION_AGENT_ID,
} from "@crow-central-agency/shared";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { AgentRegistry } from "../../services/agent-registry.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getConvertTimeToolConfig } from "./convert-time.js";
import { getInspectJsonToolConfig } from "./inspect-json.js";

export const TOOLBOX_MCP_SERVER_NAME = "crow-toolbox";

/**
 * Define the crow-toolbox MCP server. Provides general-purpose helpers for tasks agents are
 * unreliable at unaided: converting between epoch values and readable local time, and navigating
 * a large JSON payload without burning the context window on it.
 */
export function getToolboxMcpServerDefinition(
  sensorManager: SensorManager,
  registry: AgentRegistry
): McpServerDefinition {
  return {
    name: TOOLBOX_MCP_SERVER_NAME,
    disallowedAgentIds: [
      CROW_TASK_DISPATCHER_AGENT_ID,
      CROW_NARRATIVE_ARCHITECT_AGENT_ID,
      CROW_WORLD_BUILDER_AGENT_ID,
      FRAGMENT_REFLECTION_AGENT_ID,
    ],
    getTools: (agentId) => [
      defineMcpTool(getConvertTimeToolConfig(sensorManager)),
      defineMcpTool(getInspectJsonToolConfig(agentId, registry)),
    ],
  };
}
