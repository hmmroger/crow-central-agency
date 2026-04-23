import { z } from "zod";
import type { CrowScheduler } from "../../services/crow-scheduler.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";

export const DELETE_REMINDER_TOOL_NAME = "delete_reminder";

export function getDeleteReminderToolConfig(agentId: string, scheduler: CrowScheduler) {
  const inputSchema = {
    reminder_id: z.string().describe("The ID of the reminder to delete"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ reminder_id }) => {
    try {
      const agentReminders = scheduler.listAgentReminders(agentId);
      const isOwned = agentReminders.some((reminder) => reminder.id === reminder_id);
      if (!isOwned) {
        return textToolResult(["Error: reminder not found or does not belong to you"], true);
      }

      await scheduler.deleteAgentReminder(reminder_id);
      return textToolResult([`Reminder ${reminder_id} deleted.`]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to delete reminder.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: DELETE_REMINDER_TOOL_NAME,
    description: "Delete one of your reminders by its ID. Use list_reminders to find reminder IDs.",
    inputSchema,
    handler,
  };

  return config;
}
