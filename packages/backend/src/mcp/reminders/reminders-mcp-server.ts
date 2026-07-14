import type { CrowScheduler } from "../../services/crow-scheduler.js";
import type { SensorManager } from "../../sensors/sensor-manager.js";
import { defineMcpTool } from "../crow-mcp-manager-utils.js";
import type { McpServerDefinition } from "../crow-mcp-manager.types.js";
import { getAddReminderToolConfig } from "./add-reminder.js";
import { getDeleteReminderToolConfig } from "./delete-reminder.js";
import { getListRemindersToolConfig } from "./list-reminders.js";
import {
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  FRAGMENT_REFLECTION_AGENT_ID,
} from "@crow-central-agency/shared";

export const REMINDERS_MCP_SERVER_NAME = "crow-reminders";

/**
 * Define the crow-reminders MCP server. Provides tools for creating, deleting, and listing
 * reminders. Each agent can only manage its own reminders.
 */
export function getRemindersMcpServerDefinition(
  scheduler: CrowScheduler,
  sensorManager: SensorManager
): McpServerDefinition {
  return {
    name: REMINDERS_MCP_SERVER_NAME,
    disallowedAgentIds: [
      CROW_TASK_DISPATCHER_AGENT_ID,
      CROW_NARRATIVE_ARCHITECT_AGENT_ID,
      CROW_WORLD_BUILDER_AGENT_ID,
      FRAGMENT_REFLECTION_AGENT_ID,
    ],
    getTools: (agentId) => [
      defineMcpTool(getAddReminderToolConfig(agentId, scheduler, sensorManager)),
      defineMcpTool(getDeleteReminderToolConfig(agentId, scheduler)),
      defineMcpTool(getListRemindersToolConfig(agentId, scheduler, sensorManager)),
    ],
  };
}
