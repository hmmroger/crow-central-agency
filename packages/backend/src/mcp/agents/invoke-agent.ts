import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { AGENT_TASK_SOURCE_TYPE, MESSAGE_SOURCE_TYPE, type AgentConfig } from "@crow-central-agency/shared";
import type { AgentRegistry } from "../../services/agent-registry.js";
import type { AgentRuntimeManager } from "../../services/runtime/agent-runtime-manager.js";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const INVOKE_AGENT_TOOL_NAME = "invoke_agent";

export function getInvokeAgentToolConfig(
  agentId: string,
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  taskManager: AgentTaskManager
) {
  const inputSchema = {
    agent_id: z.string().describe("The ID of the target agent to delegate the task to. Use list_agents to find IDs"),
    task: z
      .string()
      .describe(
        "A clear, self-contained description of what the target agent should do. Include all necessary context since the target agent does not share your conversation history"
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ agent_id, task }) => {
    if (agentId === agent_id) {
      return textToolResult(["Error: cannot invoke yourself"], true);
    }

    const sourceAgentConfig = registry.getAgent(agentId);
    let targetAgentConfig: AgentConfig;
    try {
      targetAgentConfig = registry.getAgent(agent_id);
    } catch {
      return textToolResult(["Error: target agent not found"], true);
    }

    // Only attribute sub-tasks when actively working on a task (TASK),
    // not when handling a completed task's result notification (TASK_RESULT).
    const sourceAgentState = runtimeManager.getState(agentId);
    const sourceTaskId =
      sourceAgentState?.messageSource?.sourceType === MESSAGE_SOURCE_TYPE.TASK
        ? sourceAgentState.messageSource.taskId
        : undefined;
    const sourceTask = sourceTaskId ? taskManager.getTask(sourceTaskId) : undefined;

    try {
      const result = await createTask(taskManager, sourceAgentConfig, targetAgentConfig, task, sourceTask?.id);
      trace.getActiveSpan()?.addEvent("agent_invoke", {
        "source.agent_id": agentId,
        "source.agent_name": sourceAgentConfig.name,
        "target.agent_id": targetAgentConfig.id,
        "target.agent_name": targetAgentConfig.name,
      });

      return textToolResult([result]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to invoke agent.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: INVOKE_AGENT_TOOL_NAME,
    description:
      "Delegate a task to another agent. The target agent will work on it asynchronously and write results to its artifacts. You will be notified automatically when the agent finishes.",
    inputSchema,
    handler,
  };

  return config;
}

async function createTask(
  taskManager: AgentTaskManager,
  sourceAgentConfig: AgentConfig,
  targetAgentConfig: AgentConfig,
  task: string,
  parentTaskId?: string
): Promise<string> {
  const originateSource = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: sourceAgentConfig.id } as const;
  const ownerSource = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: targetAgentConfig.id } as const;
  // agent visibility enforcement in task manager
  await taskManager.addTask(task, originateSource, ownerSource, parentTaskId);

  return `Task sent to agent "${targetAgentConfig.name}" (${targetAgentConfig.id}). The agent is working on it and you will be notified when the result is ready.`;
}
