import { z } from "zod";
import type { CrowScheduler } from "../../services/crow-scheduler.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import type { McpToolConfig, ToolHandler } from "../crow-mcp-manager.types.js";
import { applyPagination, formatPaginationHeader, getErrorToolResult, textToolResult } from "../tool-utils.js";
import { formatReminder } from "./reminders-mcp-server-utils.js";

const DEFAULT_REMINDERS_LIMIT = 50;

export const LIST_REMINDERS_TOOL_NAME = "list_reminders";

export function getListRemindersToolConfig(agentId: string, scheduler: CrowScheduler, sensorManager: SensorManager) {
  const inputSchema = {
    limit: z.number().optional().describe("Number of reminders to return per page."),
    skip: z.number().optional().describe("Number of reminders to skip for pagination."),
  };

  const handler: ToolHandler<typeof inputSchema> = async ({ limit, skip }) => {
    try {
      const userTimezone = await sensorManager.getUserTimezone();
      const reminders = scheduler.listAgentReminders(agentId);
      if (reminders.length === 0) {
        return textToolResult(["You have no upcoming reminders."]);
      }

      const pagination = applyPagination(reminders, limit || DEFAULT_REMINDERS_LIMIT, skip);
      const formatted = pagination.items.map((reminder) => formatReminder(reminder, userTimezone)).join("\n---\n");
      const header = formatPaginationHeader("Your reminders", pagination);
      return textToolResult(header.concat("", formatted));
    } catch (error) {
      return getErrorToolResult(error, "Failed to list reminders.");
    }
  };

  const config: McpToolConfig<typeof inputSchema> = {
    name: LIST_REMINDERS_TOOL_NAME,
    description: `List all your upcoming reminders, sorted by time (default: ${DEFAULT_REMINDERS_LIMIT} items).`,
    inputSchema,
    handler,
  };

  return config;
}
