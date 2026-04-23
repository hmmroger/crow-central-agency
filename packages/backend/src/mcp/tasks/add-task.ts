import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatLocalDateTime } from "../../utils/date-utils.js";

export const ADD_TASK_TOOL_NAME = "add_task";

export function getAddTaskToolConfig(agentId: string, taskManager: AgentTaskManager, sensorManager: SensorManager) {
  const inputSchema = {
    task: z.string().describe("A clear description of what needs to be done"),
    parent_task_id: z.string().optional().describe("Optional parent task ID to create as a sub-task"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ task, parent_task_id }) => {
    try {
      const newTask = await taskManager.addTask(
        task,
        { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId },
        undefined,
        parent_task_id
      );

      const userTimezone = await sensorManager.getUserTimezone();
      return textToolResult([
        "Task created successfully.",
        `Task ID: ${newTask.id}`,
        `Created: ${formatLocalDateTime(new Date(newTask.createdTimestamp), userTimezone)}`,
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to create task.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: ADD_TASK_TOOL_NAME,
    description:
      "Create a new task. The task starts in OPEN state and can later be assigned to an agent. Optionally specify a parent_task_id to create as a sub-task.",
    inputSchema,
    handler,
  };

  return config;
}
