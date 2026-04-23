import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { getAddTaskToolConfig } from "./add-task.js";
import { getAssignTaskToolConfig } from "./assign-task.js";

export const CROW_SUPER_TASKS_MCP_SERVER_NAME = "crow-super-tasks";

export function createSuperTasksMcpServer(
  agentId: string,
  taskManager: AgentTaskManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpSdkServerConfigWithInstance {
  const addTask = getAddTaskToolConfig(agentId, taskManager, sensorManager);
  const assignTask = getAssignTaskToolConfig(agentId, taskManager, registry, circleManager);

  return createSdkMcpServer({
    name: CROW_SUPER_TASKS_MCP_SERVER_NAME,
    tools: [
      tool(addTask.name, addTask.description, addTask.inputSchema, addTask.handler, {
        annotations: addTask.annotations,
      }),
      tool(assignTask.name, assignTask.description, assignTask.inputSchema, assignTask.handler, {
        annotations: assignTask.annotations,
      }),
    ],
  });
}
