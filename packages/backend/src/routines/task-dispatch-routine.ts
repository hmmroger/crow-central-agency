import {
  AGENT_TASK_SOURCE_TYPE,
  CROW_SYSTEM_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  type AgentTaskItem,
} from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import { logger } from "../utils/logger.js";
import { MESSAGE_SOURCE_TYPE } from "../services/message-queue-manager.types.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { MessageRoles } from "../services/text-generation/text-generation-service.types.js";

const ROUTINE_ID = "task-dispatch";

const TASK_TRIAGE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [`New unassigned task (Task ID: {taskId}) added, please triage the task and assign an owner.`],
    },
  ],
  keys: ["taskId"],
};

const NEW_USER_TASK_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        "The task dispatcher has assigned a new task (Task ID: {taskId}) to the user.",
        "Retrieve and review the task and determine if you can proactively assist.",
        "If the task is outside your capabilities or already self-contained, take no action.",
      ],
    },
  ],
  keys: ["taskId"],
};

const log = logger.child({ context: "task-dispatch-routine" });

class TaskDispatchRoutine {
  constructor(private readonly runtimeManager: AgentRuntimeManager) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 20,
      onTaskAdded: this.onTaskAdded.bind(this),
      onTaskAssigned: this.onTaskAssigned.bind(this),
    };
  }

  private async onTaskAdded(task: AgentTaskItem): Promise<void> {
    // Do nothing if task assigned
    if (task.ownerSource) {
      return;
    }

    const prompt = createMessageContentFromTemplate(TASK_TRIAGE_PROMPT, getDefaultPromptContext({ taskId: task.id }));
    this.runtimeManager
      .sendMessage(CROW_TASK_DISPATCHER_AGENT_ID, prompt, { sourceType: MESSAGE_SOURCE_TYPE.NOTIFICATION })
      .catch(() => {
        log.error("Task send message failed");
      });
  }

  private async onTaskAssigned(task: AgentTaskItem): Promise<void> {
    if (
      task.dispatchSource?.sourceType !== AGENT_TASK_SOURCE_TYPE.AGENT ||
      task.dispatchSource.agentId !== CROW_TASK_DISPATCHER_AGENT_ID
    ) {
      return;
    }

    if (task.ownerSource?.sourceType !== AGENT_TASK_SOURCE_TYPE.USER) {
      return;
    }

    const prompt = createMessageContentFromTemplate(NEW_USER_TASK_PROMPT, getDefaultPromptContext({ taskId: task.id }));
    this.runtimeManager
      .sendMessage(CROW_SYSTEM_AGENT_ID, prompt, { sourceType: MESSAGE_SOURCE_TYPE.NOTIFICATION })
      .catch(() => {
        log.error("Task send message failed");
      });
  }
}

export function createTaskDispatchRoutine(runtimeManager: AgentRuntimeManager): Routine {
  const instance = new TaskDispatchRoutine(runtimeManager);
  return instance.createRoutine();
}
