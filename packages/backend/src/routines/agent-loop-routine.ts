import { AGENT_TASK_SOURCE_TYPE } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import { logger } from "../utils/logger.js";

const ROUTINE_ID = "agent-loop";

const log = logger.child({ context: "agent-loop-routine" });

/**
 * Handles loop tick events by creating and assigning a task to the target agent.
 * Separated from the scheduler so tick detection and task creation are decoupled.
 */
class AgentLoopRoutine {
  constructor(private readonly taskManager: AgentTaskManager) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 50,
      onLoopTick: (agentId, prompt) => this.onLoopTick(agentId, prompt),
    };
  }

  private async onLoopTick(agentId: string, prompt: string): Promise<void> {
    const loopSource = { sourceType: AGENT_TASK_SOURCE_TYPE.LOOP };
    const agentOwner = { sourceType: AGENT_TASK_SOURCE_TYPE.AGENT, agentId };

    const task = await this.taskManager.addTask(prompt, loopSource, agentOwner);
    log.debug({ agentId, taskId: task.id }, "Loop task created and assigned");
  }
}

export function createAgentLoopRoutine(taskManager: AgentTaskManager): Routine {
  const instance = new AgentLoopRoutine(taskManager);
  return instance.createRoutine();
}
