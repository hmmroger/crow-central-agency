import type { AgentTaskSourceType, AgentStatus, AgentTaskItem, AgentTaskState } from "@crow-central-agency/shared";
import { AGENT_STATUS, AGENT_TASK_SOURCE_TYPE, AGENT_TASK_STATE } from "@crow-central-agency/shared";
import type { Routine } from "./routine-manager.types.js";
import type { AgentRuntimeManager } from "../services/runtime/agent-runtime-manager.js";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import { head } from "es-toolkit";
import { logger } from "../utils/logger.js";
import { MESSAGE_SOURCE_TYPE, type MessageSource } from "../services/message-queue-manager.types.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { createMessageContentFromTemplate, getDefaultPromptContext } from "../utils/message-template.js";
import type { MessageTemplate } from "../utils/message-template.types.js";
import { MessageRoles } from "../services/content-generation/content-generation.types.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { GET_TASK_RESULT_TOOL_NAME } from "../mcp/tasks/get-task-result.js";
import type { ArtifactRecord } from "../services/runtime/agent-runtime-manager.types.js";

const ROUTINE_ID = "inter-agent-task";

const PLAIN_TASK_SOURCE = new Set<AgentTaskSourceType>([
  AGENT_TASK_SOURCE_TYPE.LOOP,
  AGENT_TASK_SOURCE_TYPE.REMINDER,
  AGENT_TASK_SOURCE_TYPE.SYSTEM,
]);

const INTER_AGENT_INVOKE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Agent request from "{agentName}" ({agentId})]`,
        "",
        "{task}",
        "",
        "Please perform this task. Your final response will be captured as the task result. Write to an artifact only if the output is large or needs to be referenced later.",
      ],
    },
  ],
  keys: ["agentName", "agentId", "task"],
};

const INTER_AGENT_INVOKE_RESUME_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Resume task from "{agentName}" ({agentId}) — all sub-tasks are now resolved]`,
        "",
        "Original task:",
        "{task}",
        "",
        "All sub-tasks you delegated have completed. Review their results above and finalize this task.",
        "Your final response will be captured as the task result.",
      ],
    },
    {
      content: [
        "",
        "Note: Some sub-tasks were handled by agents not visible to {agentName}.",
        "When formulating your response, follow circle conventions of agents involved.",
      ],
      keys: ["hasHiddenSubTaskOwners"],
    },
  ],
  keys: ["agentName", "agentId", "task", "hasHiddenSubTaskOwners"],
};

const USER_TASK_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[User created task]`,
        "",
        "{task}",
        "",
        "Please perform this task. Your final response will be captured as the task result. Write to an artifact only if the output is large or needs to be referenced later.",
      ],
    },
  ],
  keys: ["task"],
};

const USER_TASK_RESUME_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Resume user task — all sub-tasks are now resolved]`,
        "",
        "Original task:",
        "{task}",
        "",
        "All sub-tasks you delegated have completed. Review their results above and finalize this task.",
        "Your final response will be captured as the task result.",
      ],
    },
  ],
  keys: ["task"],
};

const TASK_CONTENT_UPDATED_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task updated: The content of task (Task ID: {taskId}) assigned to you has been updated]`,
        "",
        "Updated content:",
        "{task}",
        "",
        "Please review the updated task. If you have already started work based on the previous content, adjust accordingly.",
      ],
    },
  ],
  keys: ["taskId", "task"],
};

const TASK_COMPLETED_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task completed: Agent "{agentName}" ({agentId}) has completed your requested task (Task ID: {taskId})]`,
        "",
        `Please review the result using ${GET_TASK_RESULT_TOOL_NAME} tool.`,
      ],
    },
  ],
  keys: ["agentId", "agentName", "taskId"],
};

const TASK_COMPLETED_NO_MESSAGE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task completed: Agent "{agentName}" ({agentId}) has completed your requested task (Task ID: {taskId}), but did not produce any response.]`,
      ],
    },
  ],
  keys: ["agentId", "agentName", "taskId"],
};

const TASK_INCOMPLETE_PROMPT: MessageTemplate = {
  role: MessageRoles.user,
  content: [
    {
      content: [
        `[Task interrupted: Agent "{agentName}" ({agentId}) was unable to complete your requested task (Task ID: {taskId}). The task was interrupted or encountered an error.]`,
      ],
    },
  ],
  keys: ["agentId", "agentName", "taskId"],
};

const log = logger.child({ context: "inter-agent-task-routine" });

class InterAgentTaskRoutine {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly runtimeManager: AgentRuntimeManager,
    private readonly taskManager: AgentTaskManager
  ) {}

  public createRoutine(): Routine {
    return {
      id: ROUTINE_ID,
      priority: 10,
      onRuntimeManagerStartup: this.onRuntimeManagerStartup.bind(this),
      onMessageDone: this.onMessageDone.bind(this),
      onAgentStatusChanged: this.onAgentStatusChanged.bind(this),
      onTaskUpdated: this.onTaskUpdated.bind(this),
      onTaskAssigned: this.onTaskAssigned.bind(this),
      onTaskStateChanged: this.onTaskStateChanged.bind(this),
    };
  }

  private async onRuntimeManagerStartup(): Promise<void> {
    const completedTasks = this.taskManager
      .getAllTasks()
      .filter((task) => task.state === AGENT_TASK_STATE.COMPLETED || task.state === AGENT_TASK_STATE.INCOMPLETE);
    for (const task of completedTasks) {
      await this.tryClosingTask(task);
    }
  }

  private async onMessageDone(
    agentId: string,
    source: MessageSource,
    lastAssistantMessage?: string,
    artifactsWritten?: ArtifactRecord[],
    isAbortedOrError?: boolean,
    _error?: string
  ): Promise<void> {
    if (source.sourceType !== MESSAGE_SOURCE_TYPE.TASK && source.sourceType !== MESSAGE_SOURCE_TYPE.TASK_RESULT) {
      return;
    }

    const task = this.taskManager.getTask(source.taskId);
    if (!task) {
      return;
    }

    if (source.sourceType === MESSAGE_SOURCE_TYPE.TASK_RESULT) {
      if (task.parentTaskId) {
        await this.tryNudgeParentTask(agentId, task.parentTaskId);
      }

      return;
    }

    const isOriginateFromUser = task.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.USER;
    const targetState = isOriginateFromUser
      ? AGENT_TASK_STATE.OPEN
      : isAbortedOrError
        ? AGENT_TASK_STATE.INCOMPLETE
        : AGENT_TASK_STATE.COMPLETED;

    // Don't transition to COMPLETED/INCOMPLETE if sub-tasks are still unresolved
    if (!this.taskManager.areSubTasksResolved(task.id, targetState)) {
      log.info({ taskId: task.id, targetState }, "Skipping task state transition: sub-tasks not yet resolved");
      return;
    }

    const taskResults: string[] = [];
    if (artifactsWritten?.length) {
      taskResults.push("Artifact written:");
      artifactsWritten.forEach(({ circleId, filename }) =>
        taskResults.push(
          ` - ${circleId ? `[Circle artifact] Circle ID: ${circleId}` : "[Agent artifact]"} filename: ${filename}`
        )
      );
      taskResults.push("");
    }

    if (lastAssistantMessage) {
      taskResults.push(lastAssistantMessage);
    }

    await this.taskManager.updateTaskState(task.id, targetState, taskResults.join("\n"));

    if (isOriginateFromUser) {
      await this.taskManager.assignTask(
        task.id,
        { sourceType: AGENT_TASK_SOURCE_TYPE.USER },
        { sourceType: AGENT_TASK_SOURCE_TYPE.SYSTEM }
      );
    }
  }

  private async onAgentStatusChanged(agentId: string, status: AgentStatus): Promise<void> {
    if (status !== AGENT_STATUS.IDLE) {
      return;
    }

    await this.scheduleTask(agentId);
  }

  private async onTaskUpdated(task: AgentTaskItem): Promise<void> {
    const ownerAgentId =
      task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.ownerSource.agentId : undefined;
    if (!ownerAgentId) {
      return;
    }

    const prompt = createMessageContentFromTemplate(
      TASK_CONTENT_UPDATED_PROMPT,
      getDefaultPromptContext({ taskId: task.id, task: task.task })
    );

    this.runtimeManager
      .sendMessage(ownerAgentId, prompt, { sourceType: MESSAGE_SOURCE_TYPE.NOTIFICATION })
      .catch((error) => {
        log.error({ agentId: ownerAgentId, taskId: task.id, error }, "Task update notification failed");
      });
  }

  private async onTaskAssigned(task: AgentTaskItem): Promise<void> {
    const assignedAgentId =
      task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.ownerSource.agentId : undefined;
    if (!assignedAgentId) {
      return;
    }

    await this.scheduleTask(assignedAgentId);
  }

  private async onTaskStateChanged(task: AgentTaskItem, _previousState: AgentTaskState): Promise<void> {
    if (task.state !== AGENT_TASK_STATE.COMPLETED && task.state !== AGENT_TASK_STATE.INCOMPLETE) {
      return;
    }

    await this.tryClosingTask(task);
  }

  private async scheduleTask(agentId: string): Promise<void> {
    const openedTasks = this.taskManager
      .getTasksByOwner(agentId)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .filter((task) => task.state === AGENT_TASK_STATE.OPEN);
    const nextTask = head(openedTasks);
    if (!nextTask) {
      log.info({ agentId }, `No tasks pending`);
      return;
    }

    const agentState = this.runtimeManager.getState(agentId);
    if (agentState?.status !== AGENT_STATUS.IDLE) {
      log.info({ agentId }, `Agent busy, not scheduling new task`);
      return;
    }

    const sourceAgentId =
      nextTask.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? nextTask.originateSource.agentId : "";
    const sourceAgentName = sourceAgentId ? this.registry.getAgentName(sourceAgentId) : "";
    const taskPrompt = PLAIN_TASK_SOURCE.has(nextTask.originateSource.sourceType)
      ? nextTask.task
      : createMessageContentFromTemplate(
          nextTask.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.USER
            ? USER_TASK_PROMPT
            : INTER_AGENT_INVOKE_PROMPT,
          getDefaultPromptContext({
            agentId: sourceAgentId,
            agentName: sourceAgentName,
            task: nextTask.task,
          })
        );

    this.runtimeManager
      .sendMessage(agentId, taskPrompt, { sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: nextTask.id })
      .catch((error) => {
        log.error({ agentId, taskId: nextTask.id, error }, "Task send message failed");
      });

    await this.taskManager.updateTaskState(nextTask.id, AGENT_TASK_STATE.ACTIVE);
  }

  private async tryClosingTask(task: AgentTaskItem): Promise<void> {
    const owningAgentId =
      task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.ownerSource.agentId : undefined;
    try {
      const owningAgentName = this.registry.getAgentName(owningAgentId);
      const originateAgentId =
        task.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT ? task.originateSource.agentId : undefined;
      const originateAgentName = this.registry.getAgentName(originateAgentId);
      if (task.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.USER || !originateAgentId) {
        if (PLAIN_TASK_SOURCE.has(task.originateSource.sourceType)) {
          await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.CLOSED);
        }

        log.info(
          { agentId: owningAgentId, agentName: owningAgentName, taskId: task.id, taskState: task.state },
          "Task completed, no agent notification needed."
        );
        return;
      }

      let notificationPrompt: string;
      if (task.state === AGENT_TASK_STATE.INCOMPLETE) {
        notificationPrompt = createMessageContentFromTemplate(
          TASK_INCOMPLETE_PROMPT,
          getDefaultPromptContext({ agentId: owningAgentId, agentName: owningAgentName, taskId: task.id })
        );
      } else {
        notificationPrompt = createMessageContentFromTemplate(
          task.taskResult ? TASK_COMPLETED_PROMPT : TASK_COMPLETED_NO_MESSAGE_PROMPT,
          getDefaultPromptContext({
            agentId: owningAgentId,
            agentName: owningAgentName,
            taskId: task.id,
          })
        );
      }

      this.runtimeManager
        .sendMessage(originateAgentId, notificationPrompt, {
          sourceType: MESSAGE_SOURCE_TYPE.TASK_RESULT,
          taskId: task.id,
        })
        .catch((error) => {
          log.error(
            {
              agentId: owningAgentId,
              agentName: owningAgentName,
              targetAgentId: originateAgentId,
              targetAgentName: originateAgentName,
              error,
            },
            "Send message failed to notify target agent"
          );
        });

      await this.taskManager.updateTaskState(task.id, AGENT_TASK_STATE.CLOSED);
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.AGENT_NOT_FOUND) {
        log.warn({ agentId: owningAgentId, error }, "Agent no longer exists.");
      } else {
        log.error({ agentId: owningAgentId, error }, "Failed to notify target agent.");
      }
    }
  }

  private async tryNudgeParentTask(agentId: string, parentTaskId: string): Promise<void> {
    const parentTask = this.taskManager.getTask(parentTaskId);
    if (!parentTask) {
      log.warn({ taskId: parentTaskId }, "Parent task not found");
      return;
    }

    // at least all children are completed/incomplete
    if (!this.taskManager.areSubTasksResolved(parentTask.id, AGENT_TASK_STATE.INCOMPLETE)) {
      log.debug(
        { taskId: parentTaskId, subTasksCount: parentTask.subTaskIds?.length ?? 0 },
        "Skip nudge, sub tasks unresolved."
      );
      return;
    }

    if (parentTask.state !== AGENT_TASK_STATE.ACTIVE) {
      log.warn({ taskId: parentTaskId, state: parentTask.state }, "Skip nudge, parent task not in active state");
      return;
    }

    try {
      const sourceAgentId =
        parentTask.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
          ? parentTask.originateSource.agentId
          : "";
      const sourceAgentName = sourceAgentId ? this.registry.getAgentName(sourceAgentId) : "";
      const hasHiddenSubTaskOwners = this.taskManager.areSubTaskOwnersVisibleToOriginator(parentTask.id)
        ? undefined
        : "true";
      const taskPrompt = createMessageContentFromTemplate(
        parentTask.originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
          ? INTER_AGENT_INVOKE_RESUME_PROMPT
          : USER_TASK_RESUME_PROMPT,
        getDefaultPromptContext({
          agentId: sourceAgentId,
          agentName: sourceAgentName,
          task: parentTask.task,
          hasHiddenSubTaskOwners,
        })
      );

      this.runtimeManager
        .sendMessage(agentId, taskPrompt, { sourceType: MESSAGE_SOURCE_TYPE.TASK, taskId: parentTask.id })
        .catch((error) => {
          log.error({ agentId, taskId: parentTask.id, error }, "Parent task resume send message failed");
        });
    } catch (error) {
      log.error({ agentId, taskId: parentTask.id, error }, "Failed to nudge agent on parent task.");
    }
  }
}

export function createInterAgentTaskRoutine(
  registry: AgentRegistry,
  runtimeManager: AgentRuntimeManager,
  taskManager: AgentTaskManager
): Routine {
  const instance = new InterAgentTaskRoutine(registry, runtimeManager, taskManager);
  return instance.createRoutine();
}
