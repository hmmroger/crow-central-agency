import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { AgentTaskManager } from "../../services/agent-task-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const NOTIFY_USER_TOOL_NAME = "notify_user";

export function getNotifyUserToolConfig(agentId: string, taskManager: AgentTaskManager) {
  const inputSchema = {
    note: z
      .string()
      .min(1)
      .describe(
        "A clear, self-contained note for the user. Include everything they need to act or decide, since they do not share your conversation history"
      ),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ note }) => {
    if (!note.trim()) {
      return textToolResult(["Error: note cannot be empty"], true);
    }

    try {
      await taskManager.addTask(
        note,
        { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId },
        { sourceType: AGENT_TASK_SOURCE_TYPE.USER }
      );
      trace.getActiveSpan()?.addEvent("notify_user", { "source.agent_id": agentId });

      return textToolResult([
        "Your note has been delivered to the user. This is fire-and-forget — do not wait for a reply.",
        "If the user responds or dismisses it, you will be notified separately.",
      ]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to notify user.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: NOTIFY_USER_TOOL_NAME,
    description:
      "Surface a note to the user — an actionable item or a question needing their decision. Use only for items that genuinely need the user's attention. This is fire-and-forget: do not wait for a reply; if the user responds you will be notified separately.",
    inputSchema,
    handler,
  };

  return config;
}
