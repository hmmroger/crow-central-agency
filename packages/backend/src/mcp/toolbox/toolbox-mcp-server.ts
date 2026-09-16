import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  FRAGMENT_REFLECTION_AGENT_ID,
} from "@crow-central-agency/shared";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getConvertTimeToolConfig } from "./convert-time.js";

export const TOOLBOX_MCP_SERVER_NAME = "crow-toolbox";

/**
 * Define the crow-toolbox MCP server. Provides general-purpose helpers for tasks agents are
 * unreliable at unaided, starting with converting between epoch values and readable local time.
 */
export function getToolboxMcpServerDefinition(sensorManager: SensorManager): McpServerDefinition {
  return {
    name: TOOLBOX_MCP_SERVER_NAME,
    disallowedAgentIds: [
      CROW_TASK_DISPATCHER_AGENT_ID,
      CROW_NARRATIVE_ARCHITECT_AGENT_ID,
      CROW_WORLD_BUILDER_AGENT_ID,
      FRAGMENT_REFLECTION_AGENT_ID,
    ],
    getTools: () => [defineMcpTool(getConvertTimeToolConfig(sensorManager))],
  };
}
