import {
  AGENT_TASK_STATE,
  AGENT_TASK_SOURCE_TYPE,
  SERVER_MESSAGE_TYPE,
  AgentTaskItemSchema,
  type AgentTaskItem,
  type AgentTaskSource,
  type AgentTaskState,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentTaskManagerEvents } from "./agent-task-manager.types.js";
import type { WsBroadcaster } from "./ws-broadcaster.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { env } from "../config/env.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { AgentCircleManager } from "./agent-circle-manager.js";

/** Valid state transitions - maps current state to allowed next states */
const VALID_TRANSITIONS: Record<AgentTaskState, readonly AgentTaskState[]> = {
  [AGENT_TASK_STATE.OPEN]: [AGENT_TASK_STATE.ACTIVE, AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.ACTIVE]: [AGENT_TASK_STATE.OPEN, AGENT_TASK_STATE.COMPLETED, AGENT_TASK_STATE.INCOMPLETE],
  [AGENT_TASK_STATE.INCOMPLETE]: [AGENT_TASK_STATE.OPEN, AGENT_TASK_STATE.ACTIVE, AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.COMPLETED]: [AGENT_TASK_STATE.OPEN, AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.CLOSED]: [],
};

/** Required child states when transitioning a parent to COMPLETED */
const COMPLETED_REQUIRED_STATES: ReadonlySet<AgentTaskState> = new Set([
  AGENT_TASK_STATE.COMPLETED,
  AGENT_TASK_STATE.CLOSED,
]);

/** Required child states when transitioning a parent to INCOMPLETE */
const INCOMPLETE_REQUIRED_STATES: ReadonlySet<AgentTaskState> = new Set([
  AGENT_TASK_STATE.INCOMPLETE,
  AGENT_TASK_STATE.COMPLETED,
  AGENT_TASK_STATE.CLOSED,
]);

const log = logger.child({ context: "agent-task-manager" });

/** Object store table name for tasks */
export const TASK_STORE_TABLE = "agent-tasks";

/**
 * Agent task manager.
 * Persists tasks via the object store.
 * Emits lifecycle events for task state changes.
 */
export class AgentTaskManager extends EventBus<AgentTaskManagerEvents> {
  private tasks = new Map<string, AgentTaskItem>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly broadcaster: WsBroadcaster,
    private readonly circleManager: AgentCircleManager
  ) {
    super();
  }

  /**
   * Load tasks on startup.
   * Load tasks from the object store on startup.
   */
  public async initialize(): Promise<void> {
    const storeEntries = await this.store.getAll<AgentTaskItem>(TASK_STORE_TABLE);

    for (const entry of storeEntries) {
      const result = AgentTaskItemSchema.safeParse(entry.value);
      if (result.success) {
        this.tasks.set(result.data.id, result.data);
      } else {
        log.warn({ issues: result.error.issues }, "Skipping invalid task in object store");
      }
    }

    await this.pruneClosedTasks();

    log.info({ count: this.tasks.size }, "Task manager initialized");
  }

  /**
   * Create a new task with state OPEN.
   * @param task - The task content
   * @param originateSource - Who created the task
   * @param ownerSource - Optional owner to assign at creation time
   * @param parentTaskId - Optional parent task ID to create as a sub-task
   * @returns The created task item
   */
  public async addTask(
    task: string,
    originateSource: AgentTaskSource,
    ownerSource?: AgentTaskSource,
    parentTaskId?: string
  ): Promise<AgentTaskItem> {
    if (ownerSource) {
      this.assertAgentVisibility(originateSource, ownerSource);
    }

    if (parentTaskId) {
      const parentTask = this.getTaskOrThrow(parentTaskId);
      const blockedStates = new Set<AgentTaskState>([
        AGENT_TASK_STATE.COMPLETED,
        AGENT_TASK_STATE.INCOMPLETE,
        AGENT_TASK_STATE.CLOSED,
      ]);
      if (blockedStates.has(parentTask.state)) {
        throw new AppError(
          `Cannot add sub-task to parent in state ${parentTask.state}`,
          APP_ERROR_CODES.INVALID_STATE_TRANSITION
        );
      }
    }

    const now = Date.now();
    const taskItem: AgentTaskItem = {
      id: generateId(),
      parentTaskId,
      state: AGENT_TASK_STATE.OPEN,
      originateSource,
      dispatchSource: ownerSource ? originateSource : undefined,
      ownerSource,
      task,
      createdTimestamp: now,
      updatedTimestamp: now,
    };

    this.tasks.set(taskItem.id, taskItem);
    await this.store.set(TASK_STORE_TABLE, taskItem.id, taskItem);

    if (parentTaskId) {
      await this.addSubTaskToParent(parentTaskId, taskItem.id);
    }

    log.info({ taskId: taskItem.id, parentTaskId, source: originateSource, ownerSource }, "Task added");
    this.emit("taskAdded", { task: taskItem });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_ADDED, task: taskItem });

    if (ownerSource) {
      this.emit("taskAssigned", { task: taskItem });
      this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_ASSIGNED, task: taskItem });
    }

    return taskItem;
  }

  /**
   * Update the content of an OPEN task.
   * @param taskId - The task to update
   * @param newContent - The new task description
   * @throws AppError if task not found or not in OPEN state
   */
  public async updateTaskContent(taskId: string, newContent: string): Promise<AgentTaskItem> {
    const found = this.getTaskOrThrow(taskId);
    if (found.state !== AGENT_TASK_STATE.OPEN) {
      throw new AppError(
        `Cannot update content of task in state ${found.state}`,
        APP_ERROR_CODES.INVALID_STATE_TRANSITION
      );
    }

    const task: AgentTaskItem = {
      ...found,
      task: newContent,
      updatedTimestamp: Date.now(),
    };
    this.tasks.set(taskId, task);
    await this.store.set(TASK_STORE_TABLE, taskId, task);

    log.info({ taskId }, "Task content updated");
    this.emit("taskUpdated", { task });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_UPDATED, task });

    return task;
  }

  /**
   * Delete a task by ID.
   * If the task has sub-tasks, validates none are ACTIVE, then cascade-deletes them all.
   * @throws AppError if task not found, task is ACTIVE, or any sub-task is ACTIVE
   */
  public async deleteTask(taskId: string): Promise<void> {
    const task = this.getTaskOrThrow(taskId);

    if (task.state === AGENT_TASK_STATE.ACTIVE) {
      throw new AppError("Cannot delete an active task", APP_ERROR_CODES.INVALID_STATE_TRANSITION);
    }

    // Collect all descendant IDs and validate none are ACTIVE
    const descendantIds = this.collectDescendantIds(taskId);
    for (const childId of descendantIds) {
      const child = this.tasks.get(childId);
      if (child?.state === AGENT_TASK_STATE.ACTIVE) {
        throw new AppError(
          `Cannot delete: sub-task ${childId} is in ACTIVE state`,
          APP_ERROR_CODES.INVALID_STATE_TRANSITION
        );
      }
    }

    // Cascade-delete descendants (children first order doesn't matter, they're all going)
    for (const childId of descendantIds) {
      this.tasks.delete(childId);
      await this.store.delete(TASK_STORE_TABLE, childId);
      log.info({ taskId: childId, parentTaskId: taskId }, "Sub-task cascade deleted");
      this.emit("taskDeleted", { taskId: childId });
      this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_DELETED, taskId: childId });
    }

    // Delete the task itself
    this.tasks.delete(taskId);
    await this.store.delete(TASK_STORE_TABLE, taskId);

    if (task.parentTaskId) {
      await this.removeSubTaskFromParent(task.parentTaskId, taskId);
    }

    log.info({ taskId, descendantsDeleted: descendantIds.length }, "Task deleted");
    this.emit("taskDeleted", { taskId });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_DELETED, taskId });
  }

  /**
   * Assign a task to an owner.
   * @param taskId - The task to assign
   * @param ownerSource - Who will own/execute the task
   * @param dispatchSource - Who assigned the task (for completion notifications)
   * @throws AppError if task not found
   */
  public async assignTask(
    taskId: string,
    ownerSource: AgentTaskSource,
    dispatchSource: AgentTaskSource
  ): Promise<AgentTaskItem> {
    const found = this.getTaskOrThrow(taskId);
    if (found.state !== AGENT_TASK_STATE.OPEN) {
      throw new AppError(`Cannot assign task in state ${found.state}`, APP_ERROR_CODES.INVALID_STATE_TRANSITION);
    }

    this.assertAgentVisibility(found.originateSource, ownerSource);

    const task: AgentTaskItem = {
      ...found,
      ownerSource,
      dispatchSource,
      updatedTimestamp: Date.now(),
    };
    this.tasks.set(taskId, task);
    await this.store.set(TASK_STORE_TABLE, taskId, task);

    log.info({ taskId, ownerSource, dispatchSource }, "Task assigned");
    this.emit("taskAssigned", { task });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_ASSIGNED, task });

    return task;
  }

  /**
   * Transition a task to a new state, optionally setting a result.
   * @param taskId - The task to update
   * @param newState - The target state
   * @param taskResult - Optional result text to store on the task
   * @throws AppError if task not found or transition is invalid
   */
  public async updateTaskState(taskId: string, newState: AgentTaskState, taskResult?: string): Promise<AgentTaskItem> {
    const found = this.getTaskOrThrow(taskId);

    const allowed = VALID_TRANSITIONS[found.state];
    if (!allowed.includes(newState)) {
      throw new AppError(
        `Invalid state transition: ${found.state} → ${newState}`,
        APP_ERROR_CODES.INVALID_STATE_TRANSITION
      );
    }

    this.assertChildrenResolved(found, newState);

    const previousState = found.state;
    const task: AgentTaskItem = {
      ...found,
      state: newState,
      ...(taskResult !== undefined && { taskResult }),
      updatedTimestamp: Date.now(),
    };
    this.tasks.set(taskId, task);
    await this.store.set(TASK_STORE_TABLE, taskId, task);

    log.info({ taskId, previousState, newState }, "Task state changed");
    this.emit("taskStateChanged", { task, previousState });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_STATE_CHANGED, task, previousState });

    return task;
  }

  /** Get a task by ID */
  public getTask(taskId: string): AgentTaskItem | undefined {
    return this.tasks.get(taskId);
  }

  /** Get all tasks owned by an agent */
  public getTasksByOwner(agentId: string): AgentTaskItem[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT && task.ownerSource.agentId === agentId
    );
  }

  /** Get all tasks */
  public getAllTasks(): AgentTaskItem[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Check whether a task's sub-tasks are all resolved for a given target state.
   * Returns true if the task has no sub-tasks or all sub-tasks meet the criteria:
   * - COMPLETED: all children must be COMPLETED or CLOSED
   * - INCOMPLETE: all children must be INCOMPLETE, COMPLETED, or CLOSED
   * - Other states: always returns true (no sub-task constraint)
   */
  public areSubTasksResolved(taskId: string, targetState: AgentTaskState): boolean {
    const task = this.tasks.get(taskId);
    if (!task?.subTaskIds?.length) {
      return true;
    }

    let requiredStates: ReadonlySet<AgentTaskState>;
    if (targetState === AGENT_TASK_STATE.COMPLETED) {
      requiredStates = COMPLETED_REQUIRED_STATES;
    } else if (targetState === AGENT_TASK_STATE.INCOMPLETE) {
      requiredStates = INCOMPLETE_REQUIRED_STATES;
    } else {
      return true;
    }

    return task.subTaskIds.every((childId) => {
      const child = this.tasks.get(childId);
      return child !== undefined && requiredStates.has(child.state);
    });
  }

  /**
   * Check whether all sub-task owning agents are visible to the task's originator.
   * Returns true if the task has no sub-tasks, the originator is not an agent,
   * or all sub-task owners are visible to the originator.
   */
  public areSubTaskOwnersVisibleToOriginator(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task?.subTaskIds?.length) {
      return true;
    }

    if (task.originateSource.sourceType !== AGENT_TASK_SOURCE_TYPE.AGENT) {
      return true;
    }

    const originatorAgentId = task.originateSource.agentId;
    for (const childId of task.subTaskIds) {
      const child = this.tasks.get(childId);
      if (
        child?.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT &&
        !this.circleManager.isAgentVisible(originatorAgentId, child.ownerSource.agentId)
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Verify that the originating agent has visibility to the owner agent.
   * Only applies when both originate and owner are agent sources.
   */
  private assertAgentVisibility(originateSource: AgentTaskSource, ownerSource: AgentTaskSource): void {
    if (
      originateSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT &&
      ownerSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT
    ) {
      if (!this.circleManager.isAgentVisible(originateSource.agentId, ownerSource.agentId)) {
        throw new AppError(
          `Agent ${originateSource.agentId} does not have visibility to agent ${ownerSource.agentId}`,
          APP_ERROR_CODES.VALIDATION
        );
      }
    }
  }

  /** Remove closed tasks older than the configured retention period */
  private async pruneClosedTasks(): Promise<void> {
    const retentionDays = env.CLOSED_TASK_RETENTION_DAYS;
    if (!retentionDays) {
      return;
    }

    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const pruneIds: string[] = [];

    for (const task of this.tasks.values()) {
      if (task.state === AGENT_TASK_STATE.CLOSED && task.updatedTimestamp < cutoffMs) {
        pruneIds.push(task.id);
      }
    }

    for (const taskId of pruneIds) {
      this.tasks.delete(taskId);
      await this.store.delete(TASK_STORE_TABLE, taskId);
    }

    if (pruneIds.length > 0) {
      log.info({ count: pruneIds.length, retentionDays }, "Pruned closed tasks beyond retention period");
    }
  }

  /** Recursively collect all descendant task IDs */
  private collectDescendantIds(taskId: string): string[] {
    const task = this.tasks.get(taskId);
    if (!task?.subTaskIds?.length) {
      return [];
    }

    const result: string[] = [];
    for (const childId of task.subTaskIds) {
      result.push(childId);
      result.push(...this.collectDescendantIds(childId));
    }

    return result;
  }

  /** Add a child task ID to the parent's subTaskIds array */
  private async addSubTaskToParent(parentTaskId: string, childTaskId: string): Promise<void> {
    const parent = this.getTaskOrThrow(parentTaskId);
    const updatedParent: AgentTaskItem = {
      ...parent,
      subTaskIds: [...(parent.subTaskIds ?? []), childTaskId],
      updatedTimestamp: Date.now(),
    };
    this.tasks.set(parentTaskId, updatedParent);
    await this.store.set(TASK_STORE_TABLE, parentTaskId, updatedParent);

    this.emit("subTaskUpdated", { task: updatedParent });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_UPDATED, task: updatedParent });
  }

  /** Remove a child task ID from the parent's subTaskIds array */
  private async removeSubTaskFromParent(parentTaskId: string, childTaskId: string): Promise<void> {
    const parent = this.tasks.get(parentTaskId);
    if (!parent?.subTaskIds) {
      return;
    }

    const updatedParent: AgentTaskItem = {
      ...parent,
      subTaskIds: parent.subTaskIds.filter((id) => id !== childTaskId),
      updatedTimestamp: Date.now(),
    };
    this.tasks.set(parentTaskId, updatedParent);
    await this.store.set(TASK_STORE_TABLE, parentTaskId, updatedParent);

    this.emit("subTaskUpdated", { task: updatedParent });
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.TASK_UPDATED, task: updatedParent });
  }

  /**
   * Assert that all children of a parent task are resolved before
   * transitioning the parent to COMPLETED or INCOMPLETE.
   */
  private assertChildrenResolved(task: AgentTaskItem, newState: AgentTaskState): void {
    if (!this.areSubTasksResolved(task.id, newState)) {
      throw new AppError(
        `Cannot mark parent task as ${newState}: not all sub-tasks are resolved`,
        APP_ERROR_CODES.INVALID_STATE_TRANSITION
      );
    }
  }

  /** Get a task by ID or throw if not found */
  private getTaskOrThrow(taskId: string): AgentTaskItem {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AppError(`Task ${taskId} not found`, APP_ERROR_CODES.TASK_NOT_FOUND);
    }

    return task;
  }
}
