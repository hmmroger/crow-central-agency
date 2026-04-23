import { z } from "zod";
import type { CrowScheduler } from "../../services/crow-scheduler.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatReminder, parseDateTimeWithTimezone } from "./reminders-mcp-server-utils.js";

export const ADD_REMINDER_TOOL_NAME = "add_reminder";

export function getAddReminderToolConfig(agentId: string, scheduler: CrowScheduler, sensorManager: SensorManager) {
  const inputSchema = {
    text: z.string().max(2000).describe("The reminder text — what you want to be reminded about"),
    remind_at: z.string().describe("When to fire the reminder in datetime format (e.g. 2025-04-05T14:30:00)"),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ text, remind_at }) => {
    try {
      const userTimezone = await sensorManager.getUserTimezone();
      const remindAt = parseDateTimeWithTimezone(remind_at, userTimezone);

      if (!Number.isFinite(remindAt)) {
        return textToolResult(["Error: invalid datetime format for remind_at"], true);
      }

      if (remindAt <= Date.now()) {
        return textToolResult(["Error: remind_at must be in the future"], true);
      }

      const reminder = await scheduler.addAgentReminder(agentId, text, remindAt);
      return textToolResult(["Reminder created:", formatReminder(reminder, userTimezone)]);
    } catch (error) {
      return getErrorToolResult(error, "Failed to add reminder.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: ADD_REMINDER_TOOL_NAME,
    description:
      "Create a reminder that will be delivered to you at the specified time. Use the user's local datetime (e.g. 2025-04-05T14:30:00). The system will interpret it in the user's timezone.",
    inputSchema,
    handler,
  };

  return config;
}
