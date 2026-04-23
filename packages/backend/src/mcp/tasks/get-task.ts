import { z } from "zod";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatTaskItem, hasVisibilityToTask } from "./tasks-mcp-server-utils.js";

export const GET_TASK_TOOL_NAME = "get_task";

export function getTaskToolConfig(
  agentId: string,
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager,
  sensorManager: SensorManager
) {
  const inputSchema = {
    task_id: z.string().describe("The ID of the task to retrieve"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ task_id }) => {
    try {
      const task = taskManager.getTask(task_id);
      if (!task) {
        return textToolResult([`Error: task ${task_id} not found`], true);
      }

      if (!hasVisibilityToTask(agentId, task, circleManager)) {
        return textToolResult([`Error: you do not have visibility to this task`], true);
      }

      const userTimezone = await sensorManager.getUserTimezone();
      return textToolResult([formatTaskItem(task, userTimezone)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to get task.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_TASK_TOOL_NAME,
    description: "Get a task by its ID. Returns the task details including state, content, owner, and timestamps.",
    inputSchema,
    handler,
  };

  return config;
}
