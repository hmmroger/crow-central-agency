import path from "node:path";
import {
  AGENT_TASK_STATE,
  AGENT_TASK_SOURCE_TYPE,
  AgentTaskDatabaseSchema,
  type AgentTaskItem,
  type AgentTaskSource,
  type AgentTaskState,
} from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { AgentTaskManagerEvents } from "./agent-task-manager.types.js";
import { env } from "../config/env.js";
import { AGENT_TASKS_FILENAME } from "../config/constants.js";
import { readJsonFile, writeJsonFile } from "../utils/fs-utils.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

/** Current version of the persisted AgentTaskDatabase format */
const TASK_DATABASE_VERSION = 1;

/** Valid state transitions — maps current state to allowed next states */
const VALID_TRANSITIONS: Record<AgentTaskState, readonly AgentTaskState[]> = {
  [AGENT_TASK_STATE.OPEN]: [AGENT_TASK_STATE.ACTIVE, AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.ACTIVE]: [AGENT_TASK_STATE.COMPLETED, AGENT_TASK_STATE.INCOMPLETED],
  [AGENT_TASK_STATE.INCOMPLETED]: [AGENT_TASK_STATE.ACTIVE, AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.COMPLETED]: [AGENT_TASK_STATE.CLOSED],
  [AGENT_TASK_STATE.CLOSED]: [],
};

const log = logger.child({ context: "agent-task-manager" });

/**
 * File-based agent task manager.
 * Persists tasks to `<CROW_SYSTEM_PATH>/agent-tasks.json`.
 * Uses a Promise chain to serialize concurrent read-modify-write operations.
 * Emits lifecycle events for task state changes.
 */
export class AgentTaskManager extends EventBus<AgentTaskManagerEvents> {
  private tasks = new Map<string, AgentTaskItem>();
  private readonly tasksFilePath: string;
  /** Promise chain to serialize read-modify-write operations */
  private opChain: Promise<void> = Promise.resolve();

  constructor() {
    super();
    this.tasksFilePath = path.join(env.CROW_SYSTEM_PATH, AGENT_TASKS_FILENAME);
  }

  /** Load persisted tasks from disk */
  public async initialize(): Promise<void> {
    try {
      const raw = await readJsonFile<unknown>(this.tasksFilePath);
      const result = AgentTaskDatabaseSchema.safeParse(raw);

      if (result.success) {
        for (const task of result.data.tasks) {
          this.tasks.set(task.id, task);
        }

        log.info({ version: result.data.version, count: this.tasks.size }, "Loaded persisted tasks");
      } else {
        log.warn({ issues: result.error.issues }, "Invalid tasks file — starting fresh");
      }
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        log.info("No persisted tasks found — starting fresh");
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a new task with state OPEN.
   * @param task - The task content
   * @param originateSource - Who created the task
   * @returns The created task item
   */
  public async addTask(task: string, originateSource: AgentTaskSource): Promise<AgentTaskItem> {
    const now = Date.now();
    const taskItem: AgentTaskItem = {
      id: generateId(),
      state: AGENT_TASK_STATE.OPEN,
      originateSource,
      task,
      createdTimestamp: now,
      updatedTimestamp: now,
    };

    await this.serialized(async () => {
      this.tasks.set(taskItem.id, taskItem);
      await this.persistTasks();
    });

    log.info({ taskId: taskItem.id, source: originateSource }, "Task added");
    this.emit("taskAdded", { task: taskItem });

    return taskItem;
  }

  /**
   * Delete a task by ID.
   * @throws AppError if task not found
   */
  public async deleteTask(taskId: string): Promise<void> {
    await this.serialized(async () => {
      this.getTaskOrThrow(taskId);
      this.tasks.delete(taskId);
      await this.persistTasks();
    });

    log.info({ taskId }, "Task deleted");
    this.emit("taskDeleted", { taskId });
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
    const task = await this.serializedWithResult(async () => {
      const found = this.getTaskOrThrow(taskId);
      found.ownerSource = ownerSource;
      found.dispatchSource = dispatchSource;
      found.updatedTimestamp = Date.now();
      await this.persistTasks();
      return found;
    });

    log.info({ taskId, ownerSource, dispatchSource }, "Task assigned");
    this.emit("taskAssigned", { task });

    return task;
  }

  /**
   * Transition a task to a new state.
   * @throws AppError if task not found or transition is invalid
   */
  public async updateTaskState(taskId: string, newState: AgentTaskState): Promise<AgentTaskItem> {
    const { task, previousState } = await this.serializedWithResult(async () => {
      const found = this.getTaskOrThrow(taskId);

      const allowed = VALID_TRANSITIONS[found.state];
      if (!allowed.includes(newState)) {
        throw new AppError(
          `Invalid state transition: ${found.state} → ${newState}`,
          APP_ERROR_CODES.INVALID_STATE_TRANSITION
        );
      }

      const prevState = found.state;
      found.state = newState;
      found.updatedTimestamp = Date.now();
      await this.persistTasks();
      return { task: found, previousState: prevState };
    });

    log.info({ taskId, previousState, newState }, "Task state changed");
    this.emit("taskStateChanged", { task, previousState });

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

  /** Persist all tasks to disk */
  private async persistTasks(): Promise<void> {
    await writeJsonFile(this.tasksFilePath, {
      version: TASK_DATABASE_VERSION,
      tasks: Array.from(this.tasks.values()),
    });
  }

  /** Get a task by ID or throw if not found */
  private getTaskOrThrow(taskId: string): AgentTaskItem {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new AppError(`Task ${taskId} not found`, APP_ERROR_CODES.TASK_NOT_FOUND);
    }

    return task;
  }

  /**
   * Serialize an async operation using a Promise chain.
   * Returns the operation's result. Ensures read-modify-write cycles don't interleave.
   */
  private async serializedWithResult<T>(operation: () => Promise<T>): Promise<T> {
    const next: Promise<T> = this.opChain.catch(() => undefined).then(operation);
    this.opChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  /** Serialize a void async operation */
  private async serialized(operation: () => Promise<void>): Promise<void> {
    await this.serializedWithResult(operation);
  }
}
