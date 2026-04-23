import { z } from "zod";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { hasVisibilityToTask } from "./tasks-mcp-server-utils.js";

export const GET_TASK_RESULT_TOOL_NAME = "get_task_result";

export function getTaskResultToolConfig(
  agentId: string,
  taskManager: AgentTaskManager,
  circleManager: AgentCircleManager
) {
  const inputSchema = {
    task_id: z.string().describe("The ID of the task to get the result for"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ task_id }) => {
    try {
      const task = taskManager.getTask(task_id);
      if (!task) {
        return textToolResult([`Error: task ${task_id} not found`], true);
      }

      if (!hasVisibilityToTask(agentId, task, circleManager)) {
        return textToolResult(["Error: you do not have visibility to this task"], true);
      }

      if (!task.taskResult) {
        return textToolResult([`Task ${task_id} has no result (state: ${task.state})`]);
      }

      return textToolResult([task.taskResult]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to get task result.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: GET_TASK_RESULT_TOOL_NAME,
    description: "Get the result of a completed or closed task by its ID. Returns the task result text if available.",
    inputSchema,
    handler,
  };

  return config;
}
