import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { CrowScheduler } from "../../services/crow-scheduler.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { getAddReminderToolConfig } from "./add-reminder.js";
import { getDeleteReminderToolConfig } from "./delete-reminder.js";
import { getListRemindersToolConfig } from "./list-reminders.js";

export const REMINDERS_MCP_SERVER_NAME = "crow-reminders";

/**
 * Create the crow-reminders MCP server for a specific agent.
 * Provides tools for creating, deleting, and listing reminders.
 * Each agent can only manage its own reminders.
 */
export function createRemindersMcpServer(
  agentId: string,
  scheduler: CrowScheduler,
  sensorManager: SensorManager
): McpSdkServerConfigWithInstance {
  const addReminder = getAddReminderToolConfig(agentId, scheduler, sensorManager);
  const deleteReminder = getDeleteReminderToolConfig(agentId, scheduler);
  const listReminders = getListRemindersToolConfig(agentId, scheduler, sensorManager);

  return createSdkMcpServer({
    name: REMINDERS_MCP_SERVER_NAME,
    tools: [
      tool(addReminder.name, addReminder.description, addReminder.inputSchema, addReminder.handler, {
        annotations: addReminder.annotations,
      }),
      tool(deleteReminder.name, deleteReminder.description, deleteReminder.inputSchema, deleteReminder.handler, {
        annotations: deleteReminder.annotations,
      }),
      tool(listReminders.name, listReminders.description, listReminders.inputSchema, listReminders.handler, {
        annotations: listReminders.annotations,
      }),
    ],
  });
}
