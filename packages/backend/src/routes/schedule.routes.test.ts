import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { TIME_MODE, type CreateScheduleInput, type Schedule } from "@crow-central-agency/shared";
import { registerScheduleRoutes } from "./schedule.routes.js";
import { registerErrorHandler } from "../server/error-handler.js";
import { AgentRegistry } from "../services/agent-registry.js";
import { AgentCircleManager } from "../services/agent-circle-manager.js";
import { RelationshipManager } from "../services/relationship-manager.js";
import { FragmentManager } from "../services/fragment/fragment-manager.js";
import { WsBroadcaster } from "../services/ws-broadcaster.js";
import { CrowScheduler } from "../services/crow-scheduler.js";
import { ScheduleManager } from "../services/schedule-manager.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";

interface Harness {
  server: FastifyInstance;
  scheduleManager: ScheduleManager;
  firedSchedules: Schedule[];
}

async function createHarness(): Promise<Harness> {
  const store = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store);
  const circleManager = new AgentCircleManager(store, relationshipManager, broadcaster);
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager,
    broadcaster
  );
  const registry = new AgentRegistry(store, new InMemoryObjectStore(), broadcaster, circleManager, fragmentManager);
  const scheduler = new CrowScheduler(store, registry);
  const scheduleManager = new ScheduleManager(store, scheduler, registry);
  await scheduleManager.initialize();

  const firedSchedules: Schedule[] = [];
  scheduleManager.on("scheduleFired", ({ schedule }) => firedSchedules.push(schedule));

  const server = Fastify({ logger: false });
  registerErrorHandler(server);
  await registerScheduleRoutes(server, scheduleManager);
  await server.ready();

  return { server, scheduleManager, firedSchedules };
}

function createSchedulePayload(overrides: Partial<CreateScheduleInput> = {}): CreateScheduleInput {
  return {
    name: "Morning brief",
    message: "Summarize overnight news",
    enabled: false,
    agentIds: [AGENT_ID_A],
    daysOfWeek: [],
    timeMode: TIME_MODE.EVERY,
    times: [{ minute: 30 }],
    ...overrides,
  };
}

describe("POST /api/schedules", () => {
  it("creates a schedule and returns it", async () => {
    const harness = await createHarness();

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/schedules",
      payload: createSchedulePayload(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ name: "Morning brief", agentIds: [AGENT_ID_A] });
  });

  it("rejects a schedule without a message", async () => {
    const harness = await createHarness();

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/schedules",
      payload: createSchedulePayload({ message: "" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.VALIDATION);
  });
});

describe("PATCH /api/schedules/:id", () => {
  it("updates only the timing and leaves the other fields intact", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule(createSchedulePayload({ daysOfWeek: ["monday"] }));

    const response = await harness.server.inject({
      method: "PATCH",
      url: `/api/schedules/${created.id}`,
      payload: { timeMode: TIME_MODE.AT, times: [{ hour: 9 }, { hour: 17 }] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      timeMode: TIME_MODE.AT,
      times: [{ hour: 9 }, { hour: 17 }],
      name: "Morning brief",
      message: "Summarize overnight news",
      agentIds: [AGENT_ID_A],
      daysOfWeek: ["monday"],
      enabled: false,
    });
  });

  it("returns 404 for an unknown schedule", async () => {
    const harness = await createHarness();

    const response = await harness.server.inject({
      method: "PATCH",
      url: "/api/schedules/unknown-id",
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.NOT_FOUND);
  });
});

describe("POST /api/schedules/:id/run", () => {
  it("fires a disabled schedule and reports the fire", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule(createSchedulePayload());

    const response = await harness.server.inject({ method: "POST", url: `/api/schedules/${created.id}/run` });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.lastFiredTimestamp).toBeGreaterThan(0);
    await vi.waitFor(() => expect(harness.firedSchedules.map((fired) => fired.id)).toContain(created.id));
  });

  it("rejects a run for a schedule without target agents", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule(createSchedulePayload({ agentIds: [] }));

    const response = await harness.server.inject({ method: "POST", url: `/api/schedules/${created.id}/run` });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.VALIDATION);
    expect(harness.firedSchedules).toHaveLength(0);
  });

  it("returns 404 when the schedule does not exist", async () => {
    const harness = await createHarness();

    const response = await harness.server.inject({ method: "POST", url: "/api/schedules/unknown-id/run" });

    expect(response.statusCode).toBe(404);
  });
});

describe("DELETE /api/schedules/:id", () => {
  it("removes the schedule", async () => {
    const harness = await createHarness();
    const created = await harness.scheduleManager.createSchedule(createSchedulePayload());

    const response = await harness.server.inject({ method: "DELETE", url: `/api/schedules/${created.id}` });

    expect(response.statusCode).toBe(200);
    expect(harness.scheduleManager.getAllSchedules()).toHaveLength(0);
  });
});
