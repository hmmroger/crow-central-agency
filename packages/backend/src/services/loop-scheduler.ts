import { TIME_MODE, type AgentConfig, type LoopConfig } from "@crow-central-agency/shared";
import { EventBus } from "../event-bus/event-bus.js";
import type { LoopSchedulerEvents } from "./loop-scheduler.types.js";
import type { AgentRegistry } from "./agent-registry.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "loop-scheduler" });

/** One minute in milliseconds */
const ONE_MINUTE_MS = 60 * 1000;

/** One hour in milliseconds */
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/**
 * Loop scheduler — sends configured prompts to agents on a schedule.
 * Checks every minute whether any agent's loop should fire.
 *
 * timeMode "at" — trigger at a specific time point:
 *   minute: 5 → tick at XX:05 every hour
 *   hour: 14, minute: 30 → tick at 14:30 daily
 *
 * timeMode "every" — trigger at recurring intervals:
 *   minute: 15 → every 15 minutes
 *   hour: 1, minute: 30 → every 1h 30m
 */
export class LoopScheduler extends EventBus<LoopSchedulerEvents> {
  private checkInterval: ReturnType<typeof setInterval> | undefined;
  private lastTickTime = new Map<string, number>();

  constructor(private readonly registry: AgentRegistry) {
    super();
    this.listenToRegistryEvents();
  }

  /** Start the scheduler — checks every minute */
  public start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkAllAgents();
    }, ONE_MINUTE_MS);

    log.info("Loop scheduler started");
  }

  /** Stop the scheduler */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    log.info("Loop scheduler stopped");
  }

  /** Wire up registry lifecycle events — owns its own listeners */
  private listenToRegistryEvents(): void {
    this.registry.on("agentCreated", ({ agent }) => {
      if (agent.loop?.enabled && agent.loop.timeMode === TIME_MODE.EVERY) {
        // Seed so interval counts from creation, not fires immediately on first tick.
        // "at" mode needs no entry — first matching wall-clock time fires normally.
        this.lastTickTime.set(agent.id, Date.now());
        log.debug({ agentId: agent.id }, "Loop 'every' tracking seeded for new agent");
      }
    });

    this.registry.on("agentUpdated", ({ agent }) => {
      if (!agent.loop?.enabled) {
        this.lastTickTime.delete(agent.id);
        return;
      }

      if (agent.loop.timeMode === TIME_MODE.EVERY) {
        // Restart interval countdown from update time
        this.lastTickTime.set(agent.id, Date.now());
        log.debug({ agentId: agent.id }, "Loop 'every' tracking reset after config update");
      } else {
        // "at" mode — clear de-dup guard so the next matching wall-clock time fires normally
        this.lastTickTime.delete(agent.id);
        log.debug({ agentId: agent.id }, "Loop 'at' de-dup guard cleared after config update");
      }
    });

    this.registry.on("agentDeleted", ({ agentId }) => {
      this.lastTickTime.delete(agentId);
      log.debug({ agentId }, "Loop tracking removed for deleted agent");
    });
  }

  /** Check all agents and fire ticks for those whose loop is due */
  private checkAllAgents(): void {
    const now = new Date();
    for (const agent of this.registry.getAllAgents()) {
      if (!agent.loop?.enabled || !agent.loop.prompt) {
        continue;
      }

      // "every" mode needs a seed on first encounter so the interval starts
      // from now rather than firing immediately. "at" mode needs no seed —
      // shouldTickAt handles a missing entry via && short-circuit.
      if (!this.lastTickTime.has(agent.id) && agent.loop.timeMode === TIME_MODE.EVERY) {
        this.lastTickTime.set(agent.id, now.getTime());
        log.debug({ agentId: agent.id }, "Loop 'every' tracking seeded on first encounter");

        continue;
      }

      if (this.shouldTick(agent, now)) {
        this.lastTickTime.set(agent.id, now.getTime());
        this.emit("loopTick", { agentId: agent.id, prompt: agent.loop.prompt });
        log.debug({ agentId: agent.id }, "Loop tick emitted");
      }
    }
  }

  /** Determine if an agent's loop should fire now */
  private shouldTick(agent: AgentConfig, now: Date): boolean {
    const loop = agent.loop;
    if (!loop) {
      return false;
    }

    // Check day of week
    if (loop.daysOfWeek.length > 0) {
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
      const todayName = dayNames[now.getDay()];

      if (!loop.daysOfWeek.includes(todayName)) {
        return false;
      }
    }

    if (loop.timeMode === TIME_MODE.AT) {
      return this.shouldTickAt(agent.id, loop, now);
    }

    return this.shouldTickEvery(agent.id, loop, now);
  }

  /**
   * timeMode "at" — trigger at a specific time point each cycle:
   *   minute: 5 → tick at XX:05 every hour
   *   hour: 14 → tick at 14:00 daily
   *   hour: 14, minute: 30 → tick at 14:30 daily
   */
  private shouldTickAt(agentId: string, loop: LoopConfig, now: Date): boolean {
    const hasHour = loop.hour !== undefined;
    const hasMinute = loop.minute !== undefined;

    if (!hasHour && !hasMinute) {
      return false;
    }

    // Check if the current time matches the "at" spec
    if (hasHour && now.getHours() !== loop.hour) {
      return false;
    }

    // When only hour is specified, default minute to 0 (fire at HH:00)
    const requiredMinute = hasMinute ? loop.minute : 0;

    if (now.getMinutes() !== requiredMinute) {
      return false;
    }

    // Prevent double-tick within the same minute.
    // lastTick may be undefined after restart — && short-circuits safely, no seed needed for "at" mode.
    const lastTick = this.lastTickTime.get(agentId);

    if (lastTick && now.getTime() - lastTick < ONE_MINUTE_MS) {
      return false;
    }

    return true;
  }

  /**
   * timeMode "every" — trigger at recurring intervals:
   *   minute: 15 → every 15 minutes
   *   hour: 2 → every 2 hours
   *   hour: 1, minute: 30 → every 1h 30m
   */
  private shouldTickEvery(agentId: string, loop: LoopConfig, now: Date): boolean {
    const intervalMs = (loop.hour ?? 0) * ONE_HOUR_MS + (loop.minute ?? 0) * ONE_MINUTE_MS;

    if (intervalMs <= 0) {
      return false;
    }

    const lastTick = this.lastTickTime.get(agentId);

    if (!lastTick) {
      return false;
    }

    return now.getTime() - lastTick >= intervalMs;
  }
}
