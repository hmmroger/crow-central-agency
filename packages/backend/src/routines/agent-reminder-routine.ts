import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import type { AgentReminder } from "../services/crow-scheduler.types.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "agent-reminder";

const log = logger.child({ context: "agent-reminder-routine" });

/**
 * Handles reminderFired events by creating and assigning a task to the target agent.
 * Separated from the scheduler so reminder detection and task creation are decoupled.
 */
class AgentReminderRoutine {
  constructor(private readonly taskManager: AgentTaskManager) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      onReminderFired: (reminder) => this.onReminderFired(reminder),
    };
  }

  private async onReminderFired(reminder: AgentReminder): Promise<void> {
    const reminderSource = { sourceType: AGENT_TASK_SOURCE_TYPE.REMINDER };
    const agentOwner = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId: reminder.agentId };
    try {
      const task = await this.taskManager.addTask(reminder.text, reminderSource, agentOwner);
      log.debug(
        { agentId: reminder.agentId, reminderId: reminder.id, taskId: task.id },
        "Reminder task created and assigned"
      );
    } catch (error) {
      log.error(
        { agentId: reminder.agentId, reminderId: reminder.id, error },
        "Failed to create task for fired reminder"
      );
    }
  }
}

export function createAgentReminderRoutine(taskManager: AgentTaskManager): Routine {
  const instance = new AgentReminderRoutine(taskManager);
  return instance.createRoutine();
}
