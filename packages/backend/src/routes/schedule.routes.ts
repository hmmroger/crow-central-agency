import type { FastifyInstance } from "fastify";
import { CreateScheduleInputSchema, UpdateScheduleInputSchema } from "@crow-central-agency/shared";
import type { ScheduleManager } from "../services/schedule-manager.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { wrapZodError } from "./route-utils.js";

/**
 * Register schedule CRUD routes.
 * Manages top-level schedules via ScheduleManager.
 */
export async function registerScheduleRoutes(server: FastifyInstance, scheduleManager: ScheduleManager) {
  /** List all schedules */
  server.get("/api/schedules", async () => {
    const schedules = scheduleManager.getAllSchedules();

    return { success: true, data: schedules };
  });

  /** Get a single schedule by ID */
  server.get<{ Params: { id: string } }>("/api/schedules/:id", async (request) => {
    const schedule = scheduleManager.getSchedule(request.params.id);

    return { success: true, data: schedule };
  });

  /** Create a new schedule */
  server.post<{ Body: unknown }>("/api/schedules", async (request) => {
    try {
      const input = CreateScheduleInputSchema.parse(request.body);
      const schedule = await scheduleManager.createSchedule(input);

      return { success: true, data: schedule };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Update an existing schedule; omitted fields keep their stored value */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/schedules/:id", async (request) => {
    try {
      const input = UpdateScheduleInputSchema.parse(request.body);
      const schedule = await scheduleManager.updateSchedule(request.params.id, input);

      return { success: true, data: schedule };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Delete a schedule */
  server.delete<{ Params: { id: string } }>("/api/schedules/:id", async (request) => {
    await scheduleManager.deleteSchedule(request.params.id);

    return { success: true, data: { deleted: true } };
  });

  /**
   * Fire a schedule on demand through the same path as a timed tick.
   * A disabled schedule may be run — that is the point of testing one — but a
   * schedule without target agents has nothing to run.
   */
  server.post<{ Params: { id: string } }>("/api/schedules/:id/run", async (request) => {
    const schedule = scheduleManager.getSchedule(request.params.id);
    if (schedule.agentIds.length === 0) {
      throw new AppError(`Schedule ${schedule.id} has no target agents`, APP_ERROR_CODES.VALIDATION);
    }

    const fired = await scheduleManager.fireSchedule(schedule.id, { ignoreEnabled: true });
    if (!fired) {
      throw new AppError(`Schedule ${schedule.id} could not be run`, APP_ERROR_CODES.NOT_FOUND);
    }

    return { success: true, data: fired };
  });
}
