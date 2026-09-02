import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConfigSchema, TIME_MODE, type AgentConfig, type Schedule } from "@crow-central-agency/shared";
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
  loopTicks: { agentId: string; prompt: string }[];
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
  const loopTicks: { agentId: string; prompt: string }[] = [];
  scheduleManager.on("scheduleFired", ({ schedule }) => firedSchedules.push(schedule));
  scheduler.on("loopTick", (tick) => loopTicks.push(tick));

  return { store, registry, scheduler, scheduleManager, firedSchedules, loopTicks };
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

  it("still fires a legacy agent loop alongside a schedule", async () => {
    const loopAgent = makePersistedAgent(AGENT_ID_A, {
      loop: { enabled: true, daysOfWeek: [], timeMode: TIME_MODE.EVERY, times: [{ minute: 1 }], prompt: "Loop work" },
    });
    const harness = await createHarness([loopAgent]);
    useSchedulerFakeTimers();

    await harness.scheduleManager.createSchedule({
      name: "Schedule work",
      message: "Schedule message",
      enabled: true,
      agentIds: [AGENT_ID_B],
      daysOfWeek: [],
      timeMode: TIME_MODE.EVERY,
      times: [{ minute: 1 }],
    });
    harness.scheduler.start();

    await advanceMinutes(3);
    await waitForCondition(() => harness.loopTicks.length > 0 && harness.firedSchedules.length > 0);

    expect(harness.loopTicks).toContainEqual({ agentId: AGENT_ID_A, prompt: "Loop work" });
    expect(harness.firedSchedules.length).toBeGreaterThan(0);
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
