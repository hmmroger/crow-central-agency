import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_TYPE,
  AgentConfigSchema,
  BASE_CIRCLE_ID,
  CLAUDE_DEFAULT_MODEL,
  CROW_SYSTEM_AGENT_ID,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
  ENTITY_TYPE,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { AgentRegistry, AGENT_STORE_TABLE } from "./agent-registry.js";
import { AgentCircleManager } from "./agent-circle-manager.js";
import { WsBroadcaster } from "./ws-broadcaster.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { AGENTS_DIR_NAME } from "../config/constants.js";
import { env } from "../config/env.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";
const SYSTEM_AGENT_IDS = [
  CROW_SYSTEM_AGENT_ID,
  CROW_TASK_DISPATCHER_AGENT_ID,
  CROW_NARRATIVE_ARCHITECT_AGENT_ID,
  CROW_WORLD_BUILDER_AGENT_ID,
];

interface Harness {
  store: InMemoryObjectStore;
  circleManager: AgentCircleManager;
  registry: AgentRegistry;
}

function createHarness(): Harness {
  const store = new InMemoryObjectStore();
  const templateStore = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const circleManager = new AgentCircleManager(store, broadcaster);
  const registry = new AgentRegistry(store, templateStore, broadcaster, circleManager);

  return { store, circleManager, registry };
}

function makePersistedAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    id: AGENT_ID_A,
    name: "Test Agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

/** Bring both managers up in the same order the composition root uses. */
async function initialize(harness: Harness): Promise<void> {
  await harness.circleManager.initialize();
  await harness.registry.initialize();
}

afterEach(async () => {
  await rm(path.join(env.CROW_SYSTEM_PATH, AGENTS_DIR_NAME), { recursive: true, force: true });
});

describe("AgentRegistry.initialize", () => {
  it("loads a valid persisted agent from the store", async () => {
    const harness = createHarness();
    const agent = makePersistedAgent();
    await harness.store.set(AGENT_STORE_TABLE, agent.id, agent);

    await initialize(harness);

    expect(harness.registry.getAgent(agent.id)).toMatchObject({ id: agent.id, name: "Test Agent" });
  });

  it("registers all four built-in system agents", async () => {
    const harness = createHarness();

    await initialize(harness);

    for (const systemAgentId of SYSTEM_AGENT_IDS) {
      expect(harness.registry.getAgent(systemAgentId).isSystemAgent).toBe(true);
    }
  });

  it("skips an invalid persisted agent without dropping the valid ones", async () => {
    const harness = createHarness();
    const validAgent = makePersistedAgent({ id: AGENT_ID_A, name: "Valid" });
    await harness.store.set(AGENT_STORE_TABLE, validAgent.id, validAgent);
    // A malformed record (non-uuid id, no timestamps) that fails schema validation.
    await harness.store.set(AGENT_STORE_TABLE, "broken-entry", { id: "not-a-uuid", name: "Broken" });

    await initialize(harness);

    expect(harness.registry.getAgent(validAgent.id).name).toBe("Valid");
    expect(() => harness.registry.getAgent("broken-entry")).toThrow(AppError);
  });

  it("still loads a minimal legacy agent that predates newer optional fields", async () => {
    const harness = createHarness();
    // Only the fields the schema truly requires; everything else must default.
    const legacyRecord = {
      id: AGENT_ID_B,
      name: "Legacy",
      createdAt: "2025-06-01T12:00:00Z",
      updatedAt: "2025-06-01T12:00:00Z",
    };
    await harness.store.set(AGENT_STORE_TABLE, legacyRecord.id, legacyRecord);

    await initialize(harness);

    const loaded = harness.registry.getAgent(AGENT_ID_B);
    expect(loaded.name).toBe("Legacy");
    expect(loaded.type).toBe(AGENT_TYPE.CLAUDE_CODE);
    expect(loaded.model).toBe(CLAUDE_DEFAULT_MODEL);
  });

  it("keeps the built-in when a persisted record is keyed with a system agent id", async () => {
    const harness = createHarness();
    // System agent ids are non-uuid sentinels, so a persisted record under one
    // fails AgentConfigSchema validation and is skipped — the built-in wins.
    await harness.store.set(AGENT_STORE_TABLE, CROW_SYSTEM_AGENT_ID, {
      id: CROW_SYSTEM_AGENT_ID,
      name: "Tampered",
    });

    await initialize(harness);

    const systemAgent = harness.registry.getAgent(CROW_SYSTEM_AGENT_ID);
    expect(systemAgent.isSystemAgent).toBe(true);
    expect(systemAgent.name).not.toBe("Tampered");
  });

  it("assigns a loaded non-system agent to the Base Circle", async () => {
    const harness = createHarness();
    const agent = makePersistedAgent();
    await harness.store.set(AGENT_STORE_TABLE, agent.id, agent);

    await initialize(harness);

    const circleIds = harness.circleManager.getCirclesForEntity(agent.id, ENTITY_TYPE.AGENT).map((circle) => circle.id);
    expect(circleIds).toContain(BASE_CIRCLE_ID);
  });
});

describe("AgentRegistry CRUD", () => {
  it("creates a schema-valid agent, persists it, and adds Base Circle membership", async () => {
    const harness = createHarness();
    await initialize(harness);

    const created = await harness.registry.createAgent({ name: "Fresh", type: AGENT_TYPE.CLAUDE_CODE });

    expect(AgentConfigSchema.safeParse(created).success).toBe(true);
    expect(harness.registry.getAgent(created.id).name).toBe("Fresh");

    const stored = await harness.store.get<AgentConfig>(AGENT_STORE_TABLE, created.id);
    expect(stored?.value.name).toBe("Fresh");

    const circleIds = harness.circleManager
      .getCirclesForEntity(created.id, ENTITY_TYPE.AGENT)
      .map((circle) => circle.id);
    expect(circleIds).toContain(BASE_CIRCLE_ID);
  });

  it("throws AGENT_NOT_FOUND when getting an unknown agent", async () => {
    const harness = createHarness();
    await initialize(harness);

    let caught: unknown;
    try {
      harness.registry.getAgent("does-not-exist");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught instanceof AppError ? caught.errorCode : undefined).toBe(APP_ERROR_CODES.AGENT_NOT_FOUND);
  });

  it("deletes a user agent from the registry and the store", async () => {
    const harness = createHarness();
    await initialize(harness);
    const created = await harness.registry.createAgent({ name: "Disposable", type: AGENT_TYPE.CLAUDE_CODE });

    await harness.registry.deleteAgent(created.id);

    expect(() => harness.registry.getAgent(created.id)).toThrow(AppError);
    expect(await harness.store.get(AGENT_STORE_TABLE, created.id)).toBeUndefined();
  });

  it("refuses to delete a system agent", async () => {
    const harness = createHarness();
    await initialize(harness);

    await expect(harness.registry.deleteAgent(CROW_SYSTEM_AGENT_ID)).rejects.toThrow(AppError);
    expect(harness.registry.getAgent(CROW_SYSTEM_AGENT_ID).isSystemAgent).toBe(true);
  });
});
