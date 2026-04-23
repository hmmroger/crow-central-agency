import type { FastifyInstance } from "fastify";
import {
  AGENT_TASK_SOURCE_TYPE,
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  UpdateTaskStateInputSchema,
  AssignTaskInputSchema,
} from "@crow-central-agency/shared";
import type { AgentTaskManager } from "../services/agent-task-manager.js";
import type { AgentRegistry } from "../services/agent-registry.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { validateAgentIdParam } from "../utils/validation.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register task CRUD routes.
 * Tasks are user-facing units of work managed by the AgentTaskManager.
 */
export async function registerTaskRoutes(
  server: FastifyInstance,
  taskManager: AgentTaskManager,
  registry: AgentRegistry
) {
  /** List all tasks */
  server.get("/api/tasks", async () => {
    const tasks = taskManager.getAllTasks();

    return { success: true, data: tasks };
  });

  /** Get a single task by ID */
  server.get<{ Params: { id: string } }>("/api/tasks/:id", async (request) => {
    const task = taskManager.getTask(request.params.id);

    if (!task) {
      throw new AppError("Task not found", APP_ERROR_CODES.TASK_NOT_FOUND);
    }

    return { success: true, data: task };
  });

  /** Create a new task. Optionally assign an owner at creation time. */
  server.post<{ Body: unknown }>("/api/tasks", async (request) => {
    try {
      const input = CreateTaskInputSchema.parse(request.body);
      if (input.ownerSource?.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
        const validatedAgentId = validateAgentIdParam(input.ownerSource.agentId);
        registry.getAgent(validatedAgentId);
      }

      const task = await taskManager.addTask(
        input.task,
        { sourceType: AGENT_TASK_SOURCE_TYPE.USER },
        input.ownerSource,
        input.parentTaskId
      );

      return { success: true, data: task };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Update task content (only when state is OPEN) */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/tasks/:id", async (request) => {
    try {
      const input = UpdateTaskInputSchema.parse(request.body);
      const task = await taskManager.updateTaskContent(request.params.id, input.task);

      return { success: true, data: task };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Transition task state */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/tasks/:id/state", async (request) => {
    try {
      const input = UpdateTaskStateInputSchema.parse(request.body);
      const task = await taskManager.updateTaskState(request.params.id, input.state);

      return { success: true, data: task };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Assign a task to an agent or the user (only when OPEN) */
  server.post<{ Params: { id: string }; Body: unknown }>("/api/tasks/:id/assign", async (request) => {
    try {
      const input = AssignTaskInputSchema.parse(request.body);
      if (input.ownerSource.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
        const validatedAgentId = validateAgentIdParam(input.ownerSource.agentId);
        registry.getAgent(validatedAgentId);
      }

      const task = await taskManager.assignTask(request.params.id, input.ownerSource, {
        sourceType: AGENT_TASK_SOURCE_TYPE.USER,
      });

      return { success: true, data: task };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete a task (blocked for ACTIVE tasks) */
  server.delete<{ Params: { id: string } }>("/api/tasks/:id", async (request) => {
    await taskManager.deleteTask(request.params.id);

    return { success: true, data: { deleted: true } };
  });
}
