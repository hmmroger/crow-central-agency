import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { getTaskToolConfig } from "./get-task.js";
import { getTaskResultToolConfig } from "./get-task-result.js";

export const CROW_TASKS_MCP_SERVER_NAME = "crow-tasks";

export function createTasksMcpServer(
  agentId: string,
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
): McpSdkServerConfigWithInstance {
  const getTask = getTaskToolConfig(agentId, taskManager, circleManager, sensorManager);
  const getTaskResult = getTaskResultToolConfig(agentId, taskManager, circleManager);

  return createSdkMcpServer({
    name: CROW_TASKS_MCP_SERVER_NAME,
    tools: [
      tool(getTask.name, getTask.description, getTask.inputSchema, getTask.handler, {
        annotations: getTask.annotations,
      }),
      tool(getTaskResult.name, getTaskResult.description, getTaskResult.inputSchema, getTaskResult.handler, {
        annotations: getTaskResult.annotations,
      }),
    ],
  });
}
