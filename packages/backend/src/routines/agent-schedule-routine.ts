import { AGENT_TASK_SOURCE_TYPE, type Schedule } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "agent-schedule";

const log = logger.child({ context: "agent-schedule-routine" });

/**
 * Turns a fired schedule into one task per target agent.
 * Separated from the ScheduleManager so fire detection and task creation stay decoupled.
 */
class AgentScheduleRoutine {
  constructor(private readonly taskManager: AgentTaskManager) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      onScheduleFired: (schedule) => this.onScheduleFired(schedule),
    };
  }

  private async onScheduleFired(schedule: Schedule): Promise<void> {
    const scheduleSource = { sourceType: AGENT_TASK_SOURCE_TYPE.LOOP, scheduleId: schedule.id };

    // A failing agent is logged and skipped so it cannot abort the rest of the fan-out.
    for (const agentId of schedule.agentIds) {
      const agentOwner = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId };
      try {
        const task = await this.taskManager.addTask(schedule.message, scheduleSource, agentOwner);
        log.debug({ scheduleId: schedule.id, agentId, taskId: task.id }, "Schedule task created and assigned");
      } catch (error) {
        log.error({ scheduleId: schedule.id, agentId, error }, "Failed to create schedule task for agent");
      }
    }
  }
}

export function createAgentScheduleRoutine(taskManager: AgentTaskManager): Routine {
  const instance = new AgentScheduleRoutine(taskManager);
  return instance.createRoutine();
}
