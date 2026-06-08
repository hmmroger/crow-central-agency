import { CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getAddTaskToolConfig } from "./add-task.js";
import { getAssignTaskToolConfig } from "./assign-task.js";

export const CROW_SUPER_TASKS_MCP_SERVER_NAME = "crow-super-tasks";

export function getSuperTasksMcpServerDefinition(
  taskManager: AgentTaskManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpServerDefinition {
  return {
    name: CROW_SUPER_TASKS_MCP_SERVER_NAME,
    allowedAgentIds: [CROW_SYSTEM_AGENT_ID, CROW_TASK_DISPATCHER_AGENT_ID],
    getTools: (agentId) => [
      defineMcpTool(getAddTaskToolConfig(agentId, taskManager, sensorManager)),
      defineMcpTool(getAssignTaskToolConfig(agentId, taskManager, registry, circleManager)),
    ],
  };
}
