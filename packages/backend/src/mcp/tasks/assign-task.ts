import { z } from "zod";
import { AGENT_TASK_SOURCE_TYPE, type AgentTaskSource } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { AgentCircleManager } from "../../services/agent-circle-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { hasVisibilityToTask } from "./tasks-mcp-server-utils.js";

/** Value the LLM passes as assign_to to indicate user assignment */
const ASSIGN_TO_USER_VALUE = "user";

export const ASSIGN_TASK_TOOL_NAME = "assign_task";

export function getAssignTaskToolConfig(
  agentId: string,
  taskManager: AgentTaskManager,
  registry: AgentRegistry,
  circleManager: AgentCircleManager
) {
  const inputSchema = {
    task_id: z.string().describe("The ID of the task to assign"),
    assign_to: z.string().describe('The target: an agent ID, or the literal string "user" to assign to the user'),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ task_id, assign_to }) => {
    const task = taskManager.getTask(task_id);
    if (!task) {
      return textToolResult([`Error: task ${task_id} not found`], true);
    }

    if (!hasVisibilityToTask(agentId, task, circleManager)) {
      return textToolResult([`Error: you do not have visibility to this task`], true);
    }

    const isUserAssignment = assign_to === ASSIGN_TO_USER_VALUE;
    if (!isUserAssignment && agentId === assign_to) {
      return textToolResult(["Error: cannot assign a task to yourself"], true);
    }

    if (!isUserAssignment) {
      try {
        registry.getAgent(assign_to);
      } catch {
        return textToolResult([`Error: agent ${assign_to} not found`], true);
      }
    }

    if (!isUserAssignment && !hasVisibilityToTask(assign_to, task, circleManager)) {
      return textToolResult([`Error: the target agent does not have visibility to this task`], true);
    }

    try {
      const ownerSource: AgentTaskSource = isUserAssignment
        ? { sourceType: AGENT_TASK_SOURCE_TYPE.USER }
        : { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: assign_to };
      const assignedTask = await taskManager.assignTask(task_id, ownerSource, {
        sourceType: AGENT_TASK_SOURCE_TYPE.AGENT,
        agentId,
      });
      const target = isUserAssignment ? "user" : `agent ${assign_to}`;

      return textToolResult([`Task ${assignedTask.id} assigned to ${target} successfully.`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to assign task.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: ASSIGN_TASK_TOOL_NAME,
    description:
      'Assign an existing OPEN task to an agent or the user. Set assign_to to "user" to assign to the user, or provide an agent ID. Use list_agents to find available agent IDs.',
    inputSchema,
    handler,
  };

  return config;
}
