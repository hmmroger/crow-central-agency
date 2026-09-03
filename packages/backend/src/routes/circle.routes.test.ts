import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_TYPE,
  type AgentConfig,
  type Fragment,
} from "@crow-central-agency/shared";
import { registerCircleRoutes } from "./circle.routes.js";
import { registerErrorHandler } from "../server/error-handler.js";
import { AgentRegistry, AGENT_STORE_TABLE } from "../services/agent-registry.js";
import { AgentCircleManager } from "../services/agent-circle-manager.js";
import { RelationshipManager } from "../services/relationship-manager.js";
import { FragmentManager } from "../services/fragment/fragment-manager.js";
import { WsBroadcaster } from "../services/ws-broadcaster.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import { clearTempSystemPath } from "../utils/test-system-path.mock.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";

interface Harness {
  server: FastifyInstance;
  circleManager: AgentCircleManager;
  relationshipManager: RelationshipManager;
  fragmentManager: FragmentManager;
}

function persistedAgent(id: string, name: string): AgentConfig {
  return AgentConfigSchema.parse({
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

async function createHarness(agentIds: string[]): Promise<Harness> {
  const store = new InMemoryObjectStore();
  const templateStore = new InMemoryObjectStore();
  const fragmentStore = new InMemoryObjectStore();
  const indexStore = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store);
  const circleManager = new AgentCircleManager(store, relationshipManager, broadcaster);
  const fragmentManager = new FragmentManager(fragmentStore, indexStore, relationshipManager, broadcaster);
  const registry = new AgentRegistry(store, templateStore, broadcaster, circleManager, fragmentManager);

  for (const [index, agentId] of agentIds.entries()) {
    await store.set(AGENT_STORE_TABLE, agentId, persistedAgent(agentId, `Agent ${index}`));
  }

  await relationshipManager.initialize();
  await circleManager.initialize();
  await registry.initialize();
  await fragmentManager.initialize();

  const server = Fastify({ logger: false });
  registerErrorHandler(server);
  await registerCircleRoutes(server, circleManager, registry, fragmentManager);
  await server.ready();

  return { server, circleManager, relationshipManager, fragmentManager };
}

function createFragment(harness: Harness, kind: (typeof FRAGMENT_KIND)[keyof typeof FRAGMENT_KIND], agentId: string) {
  return harness.fragmentManager.createFragment({
    kind,
    cue: `${kind} cue`,
    body: `${kind} body`,
    parent: { entityType: ENTITY_TYPE.AGENT, entityId: agentId },
  });
}

function associationId(harness: Harness, agentId: string, fragmentId: string): string {
  const [association] = harness.relationshipManager.queryRelationships({
    sourceEntityId: agentId,
    targetEntityId: fragmentId,
    relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
  });

  return association.id;
}

afterEach(clearTempSystemPath);

describe("POST /api/relationships", () => {
  it("creates a MEMBERSHIP edge for an agent joining a circle", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const circle = await harness.circleManager.createCircle({ name: "Team" });

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        sourceEntityId: circle.id,
        sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
        targetEntityId: AGENT_ID_A,
        targetEntityType: ENTITY_TYPE.AGENT,
        relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.relationshipType).toBe(RELATIONSHIP_TYPE.MEMBERSHIP);
  });

  it("creates an ASSOCIATION edge anchoring an agent to a fragment", async () => {
    const harness = await createHarness([AGENT_ID_A, AGENT_ID_B]);
    const fragment = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, AGENT_ID_A);

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        sourceEntityId: AGENT_ID_B,
        sourceEntityType: ENTITY_TYPE.AGENT,
        targetEntityId: fragment.id,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.relationshipType).toBe(RELATIONSHIP_TYPE.ASSOCIATION);
  });

  it("creates a LINK edge between two fragments", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const parent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        sourceEntityId: parent.id,
        sourceEntityType: ENTITY_TYPE.FRAGMENT,
        targetEntityId: child.id,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.relationshipType).toBe(RELATIONSHIP_TYPE.LINK);
  });

  it("rejects an ASSOCIATION with a fragment source", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const fragment = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, AGENT_ID_A);

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        sourceEntityId: fragment.id,
        sourceEntityType: ENTITY_TYPE.FRAGMENT,
        targetEntityId: fragment.id,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.VALIDATION);
  });

  it("rejects a LINK with an agent end", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const fragment = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, AGENT_ID_A);

    const response = await harness.server.inject({
      method: "POST",
      url: "/api/relationships",
      payload: {
        sourceEntityId: AGENT_ID_A,
        sourceEntityType: ENTITY_TYPE.AGENT,
        targetEntityId: fragment.id,
        targetEntityType: ENTITY_TYPE.FRAGMENT,
        relationshipType: RELATIONSHIP_TYPE.LINK,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.VALIDATION);
  });
});

describe("DELETE /api/relationships/:id", () => {
  it("cascade-collects the fragment and its orphaned descendant when the last parent is removed", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const parent: Fragment = await createFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const child = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.FEEDBACK,
      cue: "child cue",
      body: "child body",
      parent: { entityType: ENTITY_TYPE.FRAGMENT, entityId: parent.id },
    });

    const response = await harness.server.inject({
      method: "DELETE",
      url: `/api/relationships/${associationId(harness, AGENT_ID_A, parent.id)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.collectedFragmentIds).toEqual(expect.arrayContaining([parent.id, child.id]));
  });

  it("returns an empty collection when a MEMBERSHIP edge is removed", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const circle = await harness.circleManager.createCircle({ name: "Team" });
    const membership = await harness.circleManager.createRelationship({
      sourceEntityId: circle.id,
      sourceEntityType: ENTITY_TYPE.AGENT_CIRCLE,
      targetEntityId: AGENT_ID_A,
      targetEntityType: ENTITY_TYPE.AGENT,
      relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP,
    });

    const response = await harness.server.inject({
      method: "DELETE",
      url: `/api/relationships/${membership.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.collectedFragmentIds).toEqual([]);
  });
});
