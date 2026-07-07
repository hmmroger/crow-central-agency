import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getTaskToolConfig } from "./get-task.js";
import { getTaskResultToolConfig } from "./get-task-result.js";
import { CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID } from "@crow-central-agency/shared";

export const CROW_TASKS_MCP_SERVER_NAME = "crow-tasks";

export function getTasksMcpServerDefinition(
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpServerDefinition {
  return {
    name: CROW_TASKS_MCP_SERVER_NAME,
    disallowedAgentIds: [CROW_NARRATIVE_ARCHITECT_AGENT_ID, CROW_WORLD_BUILDER_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getTaskToolConfig(agentId, taskManager, circleManager, sensorManager)),
      defineMcpTool(getTaskResultToolConfig(agentId, taskManager, circleManager, sensorManager)),
    ],
  };
}
