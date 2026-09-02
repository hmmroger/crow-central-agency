import {
  CreateScheduleInputSchema,
  SCHEDULE_NAME_MAX_LENGTH,
  ScheduleSchema,
  UpdateScheduleInputSchema,
  type AgentConfig,
  type CreateScheduleInput,
  type LoopConfig,
  type Schedule,
  type UpdateScheduleInput,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { SCHEDULES_STORE_TABLE } from "../config/constants.js";
import { generateId } from "../utils/id-utils.js";
import { logger } from "../utils/logger.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { CrowScheduler } from "./crow-scheduler.js";
import type { FireScheduleOptions, ScheduleManagerEvents } from "./schedule-manager.types.js";

const log = logger.child({ context: "schedule-manager" });

/** Prefix for the scheduler work id backing a schedule */
const SCHEDULE_WORK_ID_PREFIX = "schedule:";

/**
 * Owns top-level schedules — persisted CRUD plus registration with the CrowScheduler.
 * Firing only emits scheduleFired; task creation belongs to the routine layer so
 * tick detection and acting on a tick stay decoupled.
 */
export class ScheduleManager extends EventBus<ScheduleManagerEvents> {
  private schedules = new Map<string, Schedule>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly scheduler: CrowScheduler,
    private readonly registry: AgentRegistry
  ) {
    super();
    registry.on("agentDeleted", ({ agentId }) => {
      this.pruneDeletedAgent(agentId).catch((error) => {
        log.error({ agentId, error }, "Failed to prune deleted agent from schedules");
      });
    });
  }

  /**
   * Restore persisted schedules and register the enabled ones with the scheduler.
   * Must be called before CrowScheduler.start().
   */
  public async initialize(): Promise<void> {
    const entries = await this.store.getAll<Schedule>(SCHEDULES_STORE_TABLE);
    for (const entry of entries) {
      const parsed = ScheduleSchema.safeParse(entry.value);
      if (!parsed.success) {
        log.error({ error: parsed.error }, "Skipping schedule that failed validation on restore");
        continue;
      }

      this.schedules.set(parsed.data.id, parsed.data);
    }

    await this.migrateAgentLoops();

    for (const schedule of this.schedules.values()) {
      this.registerSchedule(schedule);
    }

    if (this.schedules.size > 0) {
      log.info({ count: this.schedules.size }, "Restored schedules from store");
    }
  }

  /** List all schedules */
  public getAllSchedules(): Schedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get a single schedule by ID.
   * @throws AppError with NOT_FOUND if the schedule does not exist.
   */
  public getSchedule(scheduleId: string): Schedule {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new AppError(`Schedule not found: ${scheduleId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return schedule;
  }

  /** Create a new schedule and register it when it is ready to fire */
  public async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
    const validated = CreateScheduleInputSchema.parse(input);
    const now = new Date().toISOString();
    const schedule: Schedule = { ...validated, id: generateId(), createdAt: now, updatedAt: now };

    await this.storeSchedule(schedule);
    this.registerSchedule(schedule);

    log.info({ scheduleId: schedule.id, name: schedule.name, enabled: schedule.enabled }, "Schedule created");

    return schedule;
  }

  /**
   * Apply a partial update and re-sync the scheduler registration.
   * Re-registering reseeds the interval, so editing an EVERY schedule restarts its countdown.
   */
  public async updateSchedule(scheduleId: string, input: UpdateScheduleInput): Promise<Schedule> {
    const existing = this.getSchedule(scheduleId);
    const validated = UpdateScheduleInputSchema.parse(input);
    const updated = ScheduleSchema.parse({ ...existing, ...validated, updatedAt: new Date().toISOString() });

    await this.store.set(SCHEDULES_STORE_TABLE, scheduleId, updated);
    this.schedules.set(scheduleId, updated);
    this.scheduler.unscheduleWork(this.toWorkId(scheduleId));
    this.registerSchedule(updated);
    this.emit("scheduleUpdated", { schedule: updated });

    log.info({ scheduleId, name: updated.name, enabled: updated.enabled }, "Schedule updated");

    return updated;
  }

  /** Delete a schedule and unregister it from the scheduler */
  public async deleteSchedule(scheduleId: string): Promise<void> {
    const existing = this.getSchedule(scheduleId);

    await this.store.delete(SCHEDULES_STORE_TABLE, scheduleId);
    this.scheduler.unscheduleWork(this.toWorkId(scheduleId));
    this.schedules.delete(scheduleId);

    log.info({ scheduleId, name: existing.name }, "Schedule deleted");
  }

  /**
   * Fire a schedule — stamps lastFiredTimestamp and emits scheduleFired.
   * Reads the current schedule rather than a caller-held snapshot so an edit between
   * registration and tick is honoured.
   * @returns The fired schedule, or undefined when the fire was skipped.
   */
  public async fireSchedule(scheduleId: string, options: FireScheduleOptions = {}): Promise<Schedule | undefined> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      log.warn({ scheduleId }, "Skipping fire — schedule no longer exists");
      return undefined;
    }

    if (!schedule.enabled && !options.ignoreEnabled) {
      log.debug({ scheduleId }, "Skipping fire — schedule is disabled");
      return undefined;
    }

    if (schedule.agentIds.length === 0) {
      log.warn({ scheduleId }, "Skipping fire — schedule has no target agents");
      return undefined;
    }

    const fired: Schedule = { ...schedule, lastFiredTimestamp: Date.now() };
    await this.store.set(SCHEDULES_STORE_TABLE, scheduleId, fired);
    this.schedules.set(scheduleId, fired);
    this.emit("scheduleFired", { schedule: fired });

    log.info({ scheduleId, name: fired.name, agentCount: fired.agentIds.length }, "Schedule fired");

    return fired;
  }

  /**
   * Convert every legacy agent loop into a schedule and clear the loop it came from.
   * Runs before registration so a migrated schedule is registered by the caller's normal pass.
   */
  private async migrateAgentLoops(): Promise<void> {
    let migratedCount = 0;

    for (const agent of this.registry.getAllAgents(true)) {
      const loop = agent.loop;
      if (!loop?.prompt) {
        continue;
      }

      try {
        if (!this.findMigratedSchedule(agent.id)) {
          await this.storeSchedule(this.toMigratedSchedule(agent, loop));
          migratedCount++;
        }

        await this.registry.clearAgentLoop(agent.id);
      } catch (error) {
        log.error({ agentId: agent.id, error }, "Failed to migrate agent loop — retrying on next startup");
      }
    }

    if (migratedCount > 0) {
      log.info({ count: migratedCount }, "Migrated agent loops to schedules");
    }
  }

  /** Build the schedule that replaces an agent's loop, carrying its timing over verbatim */
  private toMigratedSchedule(agent: AgentConfig, loop: LoopConfig): Schedule {
    const now = new Date().toISOString();

    return ScheduleSchema.parse({
      id: generateId(),
      name: agent.name.slice(0, SCHEDULE_NAME_MAX_LENGTH),
      message: loop.prompt,
      enabled: loop.enabled,
      agentIds: [agent.id],
      daysOfWeek: loop.daysOfWeek,
      timeMode: loop.timeMode,
      times: loop.times,
      createdAt: now,
      updatedAt: now,
      migratedFromAgentId: agent.id,
    });
  }

  /** The schedule a previous migration created for this agent, if any */
  private findMigratedSchedule(agentId: string): Schedule | undefined {
    return this.getAllSchedules().find((schedule) => schedule.migratedFromAgentId === agentId);
  }

  /** Persist a schedule, then publish it to memory — a failed write must not leave a phantom entry */
  private async storeSchedule(schedule: Schedule): Promise<void> {
    await this.store.set(SCHEDULES_STORE_TABLE, schedule.id, schedule);
    this.schedules.set(schedule.id, schedule);
  }

  /** Register a schedule with the scheduler; a schedule that cannot fire is left unregistered */
  private registerSchedule(schedule: Schedule): void {
    if (!schedule.enabled || schedule.agentIds.length === 0) {
      return;
    }

    this.scheduler.scheduleWork({
      id: this.toWorkId(schedule.id),
      timeMode: schedule.timeMode,
      times: schedule.times,
      daysOfWeek: schedule.daysOfWeek,
      callback: async () => {
        await this.fireSchedule(schedule.id);
      },
    });
  }

  /**
   * Drop a deleted agent from every schedule targeting it.
   * A schedule left without targets is disabled rather than deleted so its message
   * and timing survive for re-targeting.
   */
  private async pruneDeletedAgent(agentId: string): Promise<void> {
    for (const schedule of this.schedules.values()) {
      if (!schedule.agentIds.includes(agentId)) {
        continue;
      }

      const remainingAgentIds = schedule.agentIds.filter((targetAgentId) => targetAgentId !== agentId);
      const isEmpty = remainingAgentIds.length === 0;
      const pruned: Schedule = {
        ...schedule,
        agentIds: remainingAgentIds,
        enabled: isEmpty ? false : schedule.enabled,
        updatedAt: new Date().toISOString(),
      };

      await this.store.set(SCHEDULES_STORE_TABLE, pruned.id, pruned);
      if (isEmpty) {
        this.scheduler.unscheduleWork(this.toWorkId(schedule.id));
      }

      this.schedules.set(pruned.id, pruned);
      this.emit("scheduleUpdated", { schedule: pruned });

      log.info({ scheduleId: pruned.id, agentId, disabled: isEmpty }, "Pruned deleted agent from schedule");
    }
  }

  private toWorkId(scheduleId: string): string {
    return `${SCHEDULE_WORK_ID_PREFIX}${scheduleId}`;
  }
}
