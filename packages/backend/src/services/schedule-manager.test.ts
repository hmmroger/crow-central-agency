import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentConfigSchema,
  DAY_OF_WEEK,
  SCHEDULE_NAME_MAX_LENGTH,
  TIME_MODE,
  type AgentConfig,
  type LoopConfig,
  type Schedule,
} from "@crow-central-agency/shared";
import { AgentRegistry, AGENT_STORE_TABLE } from "./agent-registry.js";
import { AgentCircleManager } from "./agent-circle-manager.js";
import { RelationshipManager } from "./relationship-manager.js";
import { FragmentManager } from "./fragment/fragment-manager.js";
import { WsBroadcaster } from "./ws-broadcaster.js";
import { CrowScheduler } from "./crow-scheduler.js";
import { ScheduleManager } from "./schedule-manager.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { AGENTS_DIR_NAME, SCHEDULES_STORE_TABLE } from "../config/constants.js";
import { env } from "../config/env.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";

/** A Monday, used by the day-of-week cases */
const MONDAY = new Date("2026-01-05T08:00:00.000Z");

const ONE_MINUTE_MS = 60 * 1000;

/** Flush rounds allowed while waiting for deferred listeners in a fake-timer test */
const MAX_FLUSH_ATTEMPTS = 20;

interface Harness {
  store: InMemoryObjectStore;
  registry: AgentRegistry;
  scheduler: CrowScheduler;
  scheduleManager: ScheduleManager;
  firedSchedules: Schedule[];
}

function makePersistedAgent(agentId: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    id: agentId,
    name: "Test Agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

/** An agent carrying the legacy loop config the migration converts */
function makeLoopAgent(
  loopOverrides: Partial<LoopConfig> = {},
  agentOverrides: Partial<AgentConfig> = {}
): AgentConfig {
  return makePersistedAgent(AGENT_ID_A, {
    name: "Looping Agent",
    loop: {
      enabled: true,
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
      prompt: "Loop work",
      ...loopOverrides,
    },
    ...agentOverrides,
  });
}

/** Bring the scheduler stack up in the same order the composition root uses. */
async function createHarness(persistedAgents: AgentConfig[] = []): Promise<Harness> {
  const store = new InMemoryObjectStore();
  const templateStore = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store);
  const circleManager = new AgentCircleManager(store, relationshipManager, broadcaster);
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager,
    broadcaster
  );
  const registry = new AgentRegistry(store, templateStore, broadcaster, circleManager, fragmentManager);

  for (const agent of persistedAgents) {
    await store.set(AGENT_STORE_TABLE, agent.id, agent);
  }

  await relationshipManager.initialize();
  await circleManager.initialize();
  await fragmentManager.initialize();
  await registry.initialize();

  const scheduler = new CrowScheduler(store, registry);
  await scheduler.initialize();
  const scheduleManager = new ScheduleManager(store, scheduler, registry);
  await scheduleManager.initialize();

  const firedSchedules: Schedule[] = [];
  scheduleManager.on("scheduleFired", ({ schedule }) => firedSchedules.push(schedule));

  return { store, registry, scheduler, scheduleManager, firedSchedules };
}

/** Bring a fresh ScheduleManager up over the harness's store, as a server restart would. */
async function restartScheduleManager(harness: Harness): Promise<ScheduleManager> {
  const scheduler = new CrowScheduler(harness.store, harness.registry);
  await scheduler.initialize();
  const scheduleManager = new ScheduleManager(harness.store, scheduler, harness.registry);
  await scheduleManager.initialize();

  return scheduleManager;
}

/**
 * Fake the clock without faking setImmediate — the event bus defers listeners onto it,
 * so it must stay real for emitted events to be observable inside a test.
 */
function useSchedulerFakeTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
}

/** Advance the fake clock by whole minutes, flushing the async work each tick triggers. */
async function advanceMinutes(minutes: number): Promise<void> {
  for (let minute = 0; minute < minutes; minute++) {
    await vi.advanceTimersByTimeAsync(ONE_MINUTE_MS);
    await flushDeferredWork();
  }
}

/** Let the persist chain and the event bus's deferred listeners run to completion. */
async function flushDeferredWork(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await new Promise((resolve) => setImmediate(resolve));
}

/** Poll a condition that only becomes true once deferred listeners have run. */
async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < MAX_FLUSH_ATTEMPTS && !condition(); attempt++) {
    await flushDeferredWork();
  }
}

afterEach(async () => {
  vi.useRealTimers();
  await rm(path.join(env.CROW_SYSTEM_PATH, AGENTS_DIR_NAME), { recursive: true, force: true });
});

describe("ScheduleManager firing", () => {
  it("fires an enabled schedule on the scheduler tick and records the fire", async () => {
    const harness = await createHarness();
    useSchedulerFakeTimers();

    const schedule = await harness.scheduleManager.createSchedule({
      name: "Hourly sweep",
      message: "Check the news",
      enabled: true,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });
    harness.scheduler.start();

    await advanceMinutes(1);
    await waitForCondition(() => harness.firedSchedules.length > 0);

    expect(harness.firedSchedules.map((fired) => fired.id)).toContain(schedule.id);
    expect(harness.scheduleManager.getSchedule(schedule.id).lastFiredTimestamp).toBeGreaterThan(0);

    const persisted = await harness.store.get<Schedule>(SCHEDULES_STORE_TABLE, schedule.id);
    expect(persisted?.value.lastFiredTimestamp).toBeGreaterThan(0);
  });

  it("does not register a disabled schedule", async () => {
    const harness = await createHarness();
    useSchedulerFakeTimers();

    await harness.scheduleManager.createSchedule({
      name: "Paused",
      message: "Nothing yet",
      enabled: false,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });
    harness.scheduler.start();

    await advanceMinutes(3);

    expect(harness.firedSchedules).toHaveLength(0);
  });

  it("does not register a schedule without target agents", async () => {
    const harness = await createHarness();
    useSchedulerFakeTimers();

    await harness.scheduleManager.createSchedule({
      name: "Untargeted",
      message: "Nobody to run this",
      enabled: true,
      agentIds: [],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });
    harness.scheduler.start();

    await advanceMinutes(3);

    expect(harness.firedSchedules).toHaveLength(0);
  });

  it("skips a schedule whose daysOfWeek excludes today", async () => {
    const harness = await createHarness();
    useSchedulerFakeTimers();
    vi.setSystemTime(MONDAY);

    await harness.scheduleManager.createSchedule({
      name: "Tuesdays only",
      message: "Weekly report",
      enabled: true,
      agentIds: [AGENT_ID_A],
      daysOfWeek: ["tuesday"],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });
    harness.scheduler.start();

    await advanceMinutes(3);

    expect(harness.firedSchedules).toHaveLength(0);
  });

  it("fires a disabled schedule when the caller ignores the enabled flag", async () => {
    const harness = await createHarness();
    const schedule = await harness.scheduleManager.createSchedule({
      name: "Manual run",
      message: "Run me now",
      enabled: false,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 30 }],
    });

    const fired = await harness.scheduleManager.fireSchedule(schedule.id, { ignoreEnabled: true });
    await vi.waitFor(() => expect(harness.firedSchedules).toHaveLength(1));

    expect(fired?.lastFiredTimestamp).toBeGreaterThan(0);
    expect(harness.scheduleManager.getSchedule(schedule.id).enabled).toBe(false);
  });

  it("fires a schedule migrated from an agent loop", async () => {
    const harness = await createHarness([makeLoopAgent()]);
    useSchedulerFakeTimers();
    harness.scheduler.start();

    await advanceMinutes(1);
    await waitForCondition(() => harness.firedSchedules.length > 0);

    expect(harness.firedSchedules[0]?.agentIds).toEqual([AGENT_ID_A]);
    expect(harness.firedSchedules[0]?.message).toBe("Loop work");
  });
});

describe("ScheduleManager loop migration", () => {
  it("converts an agent loop into a schedule and clears the loop", async () => {
    const harness = await createHarness([makeLoopAgent({ daysOfWeek: [DAY_OF_WEEK.MONDAY] })]);

    const migrated = harness.scheduleManager.getAllSchedules();

    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      name: "Looping Agent",
      message: "Loop work",
      enabled: true,
      agentIds: [AGENT_ID_A],
      daysOfWeek: ["monday"],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
      migratedFromAgentId: AGENT_ID_A,
    });
    expect(harness.registry.getAgent(AGENT_ID_A).loop).toBeUndefined();
  });

  it("carries over the longest agent name the schedule name limit allows", async () => {
    const longestName = "L".repeat(SCHEDULE_NAME_MAX_LENGTH);
    const harness = await createHarness([makeLoopAgent({}, { name: longestName })]);

    expect(harness.scheduleManager.getAllSchedules()[0]?.name).toBe(longestName);
  });

  it("creates no duplicate schedule on a second startup", async () => {
    const harness = await createHarness([makeLoopAgent()]);
    const migratedId = harness.scheduleManager.getAllSchedules()[0]?.id;

    const restarted = await restartScheduleManager(harness);

    expect(restarted.getAllSchedules().map((schedule) => schedule.id)).toEqual([migratedId]);
  });

  it("does not recreate the schedule when clearing the loop failed", async () => {
    const harness = await createHarness();
    await harness.store.set(AGENT_STORE_TABLE, AGENT_ID_A, makeLoopAgent());
    await harness.registry.initialize();

    const clearSpy = vi
      .spyOn(harness.registry, "clearAgentLoop")
      .mockRejectedValueOnce(new Error("Simulated store write failure"));
    const afterFailure = await restartScheduleManager(harness);

    expect(afterFailure.getAllSchedules()).toHaveLength(1);
    expect(harness.registry.getAgent(AGENT_ID_A).loop).toBeDefined();

    clearSpy.mockRestore();
    const afterRetry = await restartScheduleManager(harness);

    expect(afterRetry.getAllSchedules()).toHaveLength(1);
    expect(harness.registry.getAgent(AGENT_ID_A).loop).toBeUndefined();
  });

  it("keeps the loop when the schedule could not be stored", async () => {
    const harness = await createHarness();
    await harness.store.set(AGENT_STORE_TABLE, AGENT_ID_A, makeLoopAgent());
    await harness.registry.initialize();

    const setSpy = vi.spyOn(harness.store, "set").mockRejectedValueOnce(new Error("Simulated store write failure"));
    const afterFailure = await restartScheduleManager(harness);
    setSpy.mockRestore();

    expect(afterFailure.getAllSchedules()).toHaveLength(0);
    expect(harness.registry.getAgent(AGENT_ID_A).loop).toBeDefined();

    const afterRetry = await restartScheduleManager(harness);

    expect(afterRetry.getAllSchedules()).toHaveLength(1);
    expect(harness.registry.getAgent(AGENT_ID_A).loop).toBeUndefined();
  });
});

describe("ScheduleManager mutations", () => {
  it("keeps untouched fields when only the enabled flag is updated", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule({
      name: "Morning brief",
      message: "Summarize overnight news",
      enabled: false,
      agentIds: [AGENT_ID_A, AGENT_ID_B],
      daysOfWeek: ["monday", "friday"],
      timeMode: TIME_MODE.AT,
      times: [{ hour: 9 }, { hour: 17 }],
    });

    const updated = await harness.scheduleManager.updateSchedule(created.id, { enabled: true });

    expect(updated).toMatchObject({
      enabled: true,
      name: "Morning brief",
      message: "Summarize overnight news",
      agentIds: [AGENT_ID_A, AGENT_ID_B],
      daysOfWeek: ["monday", "friday"],
      timeMode: TIME_MODE.AT,
      times: [{ hour: 9 }, { hour: 17 }],
    });
  });

  it("drops a deleted agent from a schedule and keeps the remaining targets", async () => {
    const agent = makePersistedAgent(AGENT_ID_A);
    const harness = await createHarness([agent]);
    const created = await harness.scheduleManager.createSchedule({
      name: "Team brief",
      message: "Daily standup",
      enabled: true,
      agentIds: [AGENT_ID_A, AGENT_ID_B],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 30 }],
    });

    await harness.registry.deleteAgent(AGENT_ID_A);
    await vi.waitFor(() => expect(harness.scheduleManager.getSchedule(created.id).agentIds).toEqual([AGENT_ID_B]));

    expect(harness.scheduleManager.getSchedule(created.id).enabled).toBe(true);
  });

  it("disables a schedule whose last target agent is deleted", async () => {
    const agent = makePersistedAgent(AGENT_ID_A);
    const harness = await createHarness([agent]);
    const created = await harness.scheduleManager.createSchedule({
      name: "Solo brief",
      message: "Daily standup",
      enabled: true,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 30 }],
    });

    await harness.registry.deleteAgent(AGENT_ID_A);
    await vi.waitFor(() => expect(harness.scheduleManager.getSchedule(created.id).enabled).toBe(false));

    expect(harness.scheduleManager.getSchedule(created.id).agentIds).toEqual([]);
    expect(harness.scheduleManager.getSchedule(created.id).message).toBe("Daily standup");
  });

  it("skips a persisted schedule that fails validation without dropping the valid ones", async () => {
    const harness = await createHarness();
    const valid = await harness.scheduleManager.createSchedule({
      name: "Valid",
      message: "Still loadable",
      enabled: false,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 30 }],
    });
    await harness.store.set(SCHEDULES_STORE_TABLE, "broken-entry", { id: "not-a-uuid", name: "Broken" });

    const restartedScheduler = new CrowScheduler(harness.store, harness.registry);
    const restartedManager = new ScheduleManager(harness.store, restartedScheduler, harness.registry);
    await restartedManager.initialize();

    expect(restartedManager.getAllSchedules().map((schedule) => schedule.id)).toEqual([valid.id]);
  });

  it("restores persisted schedules and re-registers the enabled ones", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule({
      name: "Restored",
      message: "Still here",
      enabled: true,
      agentIds: [AGENT_ID_A],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });

    const restartedScheduler = new CrowScheduler(harness.store, harness.registry);
    await restartedScheduler.initialize();
    const restartedManager = new ScheduleManager(harness.store, restartedScheduler, harness.registry);
    await restartedManager.initialize();

    const restoredFires: Schedule[] = [];
    restartedManager.on("scheduleFired", ({ schedule }) => restoredFires.push(schedule));

    useSchedulerFakeTimers();
    restartedScheduler.start();
    await advanceMinutes(1);
    await waitForCondition(() => restoredFires.length > 0);

    expect(restartedManager.getSchedule(created.id).name).toBe("Restored");
    expect(restoredFires.map((fired) => fired.id)).toContain(created.id);
  });
});
