import {
  DAY_OF_WEEK,
  TIME_MODE,
  type DayOfWeek,
  type SchedulerTime,
  type TimeModeType,
} from "@crow-central-agency/shared";
import { EventBus } from "../core/event-bus/event-bus.js";
import type { AgentReminder, CrowSchedulerEvents, ScheduledWork } from "./crow-scheduler.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { REMINDERS_STORE_TABLE } from "../config/constants.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "crow-scheduler" });

/** One minute in milliseconds */
const ONE_MINUTE_MS = 60 * 1000;

/** One hour in milliseconds */
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/** Day names indexed by Date.getDay() */
const DAY_NAMES_BY_DATE_INDEX: DayOfWeek[] = [
  DAY_OF_WEEK.SUNDAY,
  DAY_OF_WEEK.MONDAY,
  DAY_OF_WEEK.TUESDAY,
  DAY_OF_WEEK.WEDNESDAY,
  DAY_OF_WEEK.THURSDAY,
  DAY_OF_WEEK.FRIDAY,
  DAY_OF_WEEK.SATURDAY,
];

/**
 * Crow scheduler - manages one-shot reminders and scheduled work callbacks.
 * Checks every minute whether any schedule should fire.
 *
 * timeMode "at" - trigger at specific time points (supports multiple):
 *   times: [{ minute: 5 }] → tick at XX:05 every hour
 *   times: [{ hour: 14, minute: 30 }] → tick at 14:30 daily
 *   times: [{ hour: 9 }, { hour: 17 }] → tick at 9:00 and 17:00
 *
 * timeMode "every" - trigger at recurring intervals (single entry):
 *   times: [{ minute: 15 }] → every 15 minutes
 *   times: [{ hour: 1, minute: 30 }] → every 1h 30m
 */
export class CrowScheduler extends EventBus<CrowSchedulerEvents> {
  private checkInterval: ReturnType<typeof setInterval> | undefined;
  private reminders = new Map<string, AgentReminder>();
  private scheduledWork = new Map<string, ScheduledWork>();
  private lastWorkTickTime = new Map<string, number>();
  private runningWork = new Set<string>();

  constructor(
    private readonly store: ObjectStoreProvider,
    private readonly registry: AgentRegistry
  ) {
    super();
    this.registry.on("agentDeleted", ({ agentId }) => this.clearAgentReminders(agentId));
  }

  /**
   * Initialize the scheduler — restore persisted reminders from store.
   * Must be called before start().
   */
  public async initialize(): Promise<void> {
    const entries = await this.store.getAll<AgentReminder>(REMINDERS_STORE_TABLE);
    for (const entry of entries) {
      this.reminders.set(entry.value.id, entry.value);
    }

    if (this.reminders.size > 0) {
      log.info({ count: this.reminders.size }, "Restored reminders from store");
    }
  }

  /** Start the scheduler - checks every minute */
  public start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkScheduledWork();
      this.checkReminders();
    }, ONE_MINUTE_MS);

    log.info("Crow scheduler started");
  }

  /** Stop the scheduler */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    log.info("Crow scheduler stopped");
  }

  /**
   * Add a reminder for an agent.
   * @param agentId - The agent to remind
   * @param text - The reminder text
   * @param remindAt - Timestamp (epoch ms) when the reminder should fire
   * @returns The created reminder
   */
  public async addAgentReminder(agentId: string, text: string, remindAt: number): Promise<AgentReminder> {
    const id = crypto.randomUUID();
    const reminder: AgentReminder = { id, agentId, text, remindAt };

    this.reminders.set(id, reminder);
    await this.store.set(REMINDERS_STORE_TABLE, id, reminder);

    log.info({ reminderId: id, agentId, remindAt: new Date(remindAt).toISOString() }, "Reminder added");
    return reminder;
  }

  /**
   * Delete a reminder by ID.
   * @returns true if the reminder existed and was deleted
   */
  public async deleteAgentReminder(reminderId: string): Promise<boolean> {
    const existed = this.reminders.delete(reminderId);
    if (existed) {
      await this.store.delete(REMINDERS_STORE_TABLE, reminderId);
      log.info({ reminderId }, "Reminder deleted");
    }

    return existed;
  }

  /** List all reminders for an agent, sorted by remindAt ascending */
  public listAgentReminders(agentId: string): AgentReminder[] {
    return Array.from(this.reminders.values())
      .filter((reminder) => reminder.agentId === agentId)
      .sort((reminderA, reminderB) => reminderA.remindAt - reminderB.remindAt);
  }

  /**
   * Register a recurring scheduled work callback.
   * The callback is invoked with the schedule ID when the time condition is met.
   * An empty or omitted daysOfWeek means the work may fire on any day.
   */
  public scheduleWork(work: ScheduledWork): void {
    if (this.scheduledWork.has(work.id)) {
      log.warn({ scheduleId: work.id }, "Replacing existing scheduled work");
    }

    this.scheduledWork.set(work.id, work);
    if (work.timeMode === TIME_MODE.EVERY) {
      this.lastWorkTickTime.set(work.id, Date.now());
    }

    log.info({ scheduleId: work.id, timeMode: work.timeMode }, "Scheduled work registered");
  }

  /** Remove a scheduled work entry by ID */
  public unscheduleWork(id: string): boolean {
    const existed = this.scheduledWork.delete(id);
    this.lastWorkTickTime.delete(id);
    this.runningWork.delete(id);
    if (existed) {
      log.info({ scheduleId: id }, "Scheduled work removed");
    }

    return existed;
  }

  /**
   * Check all reminders and emit reminderFired for those whose time has passed.
   * Listeners (e.g. the reminder routine) are responsible for task creation.
   */
  private checkReminders(): void {
    const now = Date.now();
    const firedIds: string[] = [];

    for (const reminder of this.reminders.values()) {
      if (now >= reminder.remindAt) {
        firedIds.push(reminder.id);
        this.emit("reminderFired", { reminder });
        log.debug({ agentId: reminder.agentId, reminderId: reminder.id }, "Reminder fired");
      }
    }

    for (const firedId of firedIds) {
      this.reminders.delete(firedId);
      this.store.delete(REMINDERS_STORE_TABLE, firedId).catch((error) => {
        log.error({ reminderId: firedId, error }, "Failed to delete fired reminder from store");
      });
    }
  }

  /** Check all scheduled work entries and fire those whose time condition is met */
  private checkScheduledWork(): void {
    const now = new Date();
    for (const work of this.scheduledWork.values()) {
      if (!this.matchesDaysOfWeek(work.daysOfWeek, now)) {
        continue;
      }

      if (!this.shouldFireSchedule(work.id, work.timeMode, work.times, this.lastWorkTickTime, now)) {
        continue;
      }

      // Advance the tick time before the in-flight check so a skipped tick does not cause drift.
      // Tradeoff: a callback that always outlasts its interval suppresses ticks until it settles.
      this.lastWorkTickTime.set(work.id, now.getTime());

      if (this.runningWork.has(work.id)) {
        log.warn({ scheduleId: work.id }, "Skipping scheduled work tick — previous invocation still running");
        continue;
      }

      this.runningWork.add(work.id);
      try {
        const result = work.callback(work.id);
        if (result instanceof Promise) {
          result
            .catch((error) => {
              log.error({ scheduleId: work.id, error }, "Scheduled work callback failed");
            })
            .finally(() => {
              this.runningWork.delete(work.id);
            });
        } else {
          this.runningWork.delete(work.id);
        }
      } catch (error) {
        this.runningWork.delete(work.id);
        log.error({ scheduleId: work.id, error }, "Scheduled work callback failed");
      }
    }
  }

  /** Remove all reminders for an agent from memory and store */
  private clearAgentReminders(agentId: string): void {
    const agentReminderIds: string[] = [];
    for (const reminder of this.reminders.values()) {
      if (reminder.agentId === agentId) {
        agentReminderIds.push(reminder.id);
      }
    }

    for (const reminderId of agentReminderIds) {
      this.reminders.delete(reminderId);
      this.store.delete(REMINDERS_STORE_TABLE, reminderId).catch((error) => {
        log.error({ reminderId, error }, "Failed to delete agent reminder from store");
      });
    }

    if (agentReminderIds.length > 0) {
      log.info({ agentId, count: agentReminderIds.length }, "Cleared reminders for deleted agent");
    }
  }

  /** Check whether the current day is allowed; an empty or omitted list allows every day */
  private matchesDaysOfWeek(daysOfWeek: DayOfWeek[] | undefined, now: Date): boolean {
    if (!daysOfWeek || daysOfWeek.length === 0) {
      return true;
    }

    const todayName = DAY_NAMES_BY_DATE_INDEX[now.getDay()];
    return todayName !== undefined && daysOfWeek.includes(todayName);
  }

  /** Check if a schedule should fire based on time mode, times, and last tick */
  private shouldFireSchedule(
    id: string,
    timeMode: TimeModeType,
    times: SchedulerTime[],
    lastTickMap: Map<string, number>,
    now: Date
  ): boolean {
    if (timeMode === TIME_MODE.AT) {
      return this.shouldFireAt(id, times, lastTickMap, now);
    }

    return this.shouldFireEvery(id, times, lastTickMap, now);
  }

  /**
   * timeMode "at" - trigger when the current wall-clock time matches any entry in times[].
   * Supports multiple time points (e.g. 9:00 and 17:00).
   */
  private shouldFireAt(id: string, times: SchedulerTime[], lastTickMap: Map<string, number>, now: Date): boolean {
    if (times.length === 0) {
      return false;
    }

    const matched = times.some((time) => this.matchesAtTime(time, now));
    if (!matched) {
      return false;
    }

    // Prevent double-tick within the same minute
    const lastTick = lastTickMap.get(id);
    if (lastTick && now.getTime() - lastTick < ONE_MINUTE_MS) {
      return false;
    }

    return true;
  }

  /**
   * Check if a single time entry matches the current wall-clock time.
   *   { minute: 5 }            → matches XX:05 every hour
   *   { hour: 14 }             → matches 14:00
   *   { hour: 14, minute: 30 } → matches 14:30
   */
  private matchesAtTime(time: SchedulerTime, now: Date): boolean {
    const hasHour = time.hour !== undefined;
    const hasMinute = time.minute !== undefined;
    if (!hasHour && !hasMinute) {
      return false;
    }

    if (hasHour && now.getHours() !== time.hour) {
      return false;
    }

    // When only hour is specified, default minute to 0 (fire at HH:00)
    const requiredMinute = hasMinute ? time.minute : 0;
    return now.getMinutes() === requiredMinute;
  }

  /**
   * timeMode "every" - trigger at recurring intervals.
   * Uses the first entry in times[] for the interval spec.
   */
  private shouldFireEvery(id: string, times: SchedulerTime[], lastTickMap: Map<string, number>, now: Date): boolean {
    const time = times[0];
    if (!time) {
      return false;
    }

    const intervalMs = (time.hour ?? 0) * ONE_HOUR_MS + (time.minute ?? 0) * ONE_MINUTE_MS;
    if (intervalMs <= 0) {
      return false;
    }

    const lastTick = lastTickMap.get(id);
    if (!lastTick) {
      return false;
    }

    return now.getTime() - lastTick >= intervalMs;
  }
}
