import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_DIRECTION,
  type AgentConfig,
  type Fragment,
  type FragmentKind,
  type FragmentRelationshipEntity,
} from "@crow-central-agency/shared";
import { registerFragmentRoutes } from "./fragment.routes.js";
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
  await registerFragmentRoutes(server, fragmentManager, registry, relationshipManager);
  await server.ready();

  return { server, fragmentManager };
}

function createRootFragment(harness: Harness, kind: FragmentKind, agentId: string) {
  return harness.fragmentManager.createFragment({
    kind,
    cue: `${kind} cue`,
    body: `${kind} body`,
    parent: { entityType: ENTITY_TYPE.AGENT, entityId: agentId },
  });
}

function createChildFragment(harness: Harness, kind: FragmentKind, parentFragmentId: string, cue: string) {
  return harness.fragmentManager.createFragment({
    kind,
    cue,
    body: `${cue} body`,
    parent: { entityType: ENTITY_TYPE.FRAGMENT, entityId: parentFragmentId },
  });
}

async function fetchCandidates(
  harness: Harness,
  fragmentId: string,
  direction: (typeof RELATIONSHIP_DIRECTION)[keyof typeof RELATIONSHIP_DIRECTION]
): Promise<FragmentRelationshipEntity[]> {
  const response = await harness.server.inject({
    method: "GET",
    url: `/api/fragments/${fragmentId}/relationship-candidates?direction=${direction}`,
  });

  expect(response.statusCode).toBe(200);

  return response.json().data;
}

function ids(candidates: FragmentRelationshipEntity[]): string[] {
  return candidates.map((candidate) => candidate.id);
}

afterEach(clearTempSystemPath);

describe("GET /api/fragments/:id/relationship-candidates", () => {
  it("offers a non-anchoring agent as a parent and excludes self, existing parents, and descendants", async () => {
    const harness = await createHarness([AGENT_ID_A, AGENT_ID_B]);
    const root: Fragment = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const mid = await createChildFragment(harness, FRAGMENT_KIND.DOMAIN, root.id, "mid");
    const leaf = await createChildFragment(harness, FRAGMENT_KIND.DOMAIN, mid.id, "leaf");

    const candidates = await fetchCandidates(harness, root.id, RELATIONSHIP_DIRECTION.TARGET);
    const candidateIds = ids(candidates);

    // AGENT_ID_A already anchors root; AGENT_ID_B does not
    expect(candidateIds).toContain(AGENT_ID_B);
    expect(candidateIds).not.toContain(AGENT_ID_A);
    // self and every descendant would close a cycle
    expect(candidateIds).not.toContain(root.id);
    expect(candidateIds).not.toContain(mid.id);
    expect(candidateIds).not.toContain(leaf.id);
  });

  it("applies the cycle exclusion asymmetrically: an ancestor is a valid parent but never a valid child", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const root: Fragment = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const mid = await createChildFragment(harness, FRAGMENT_KIND.DOMAIN, root.id, "mid");
    const leaf = await createChildFragment(harness, FRAGMENT_KIND.DOMAIN, mid.id, "leaf");

    const parentCandidates = await fetchCandidates(harness, leaf.id, RELATIONSHIP_DIRECTION.TARGET);
    const childCandidates = await fetchCandidates(harness, leaf.id, RELATIONSHIP_DIRECTION.SOURCE);

    // root is above leaf: allowed as a new parent, rejected as a new child (it already reaches leaf)
    expect(ids(parentCandidates)).toContain(root.id);
    expect(ids(childCandidates)).not.toContain(root.id);
    // the source direction never offers agents
    expect(childCandidates.every((candidate) => candidate.entityType === ENTITY_TYPE.FRAGMENT)).toBe(true);
  });

  it("excludes the existing direct child from the child picker", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const root: Fragment = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const child = await createChildFragment(harness, FRAGMENT_KIND.DOMAIN, root.id, "child");
    const detached = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);

    const candidateIds = ids(await fetchCandidates(harness, root.id, RELATIONSHIP_DIRECTION.SOURCE));

    expect(candidateIds).toContain(detached.id);
    expect(candidateIds).not.toContain(child.id);
  });

  it("restricts a KNOWLEDGE fragment's parent picker to DOMAIN fragments with no agents", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const domain: Fragment = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const knowledge = await createChildFragment(harness, FRAGMENT_KIND.KNOWLEDGE, domain.id, "fact");
    const otherDomain = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const feedback = await createRootFragment(harness, FRAGMENT_KIND.FEEDBACK, AGENT_ID_A);

    const candidates = await fetchCandidates(harness, knowledge.id, RELATIONSHIP_DIRECTION.TARGET);
    const candidateIds = ids(candidates);

    expect(candidates.every((candidate) => candidate.entityType === ENTITY_TYPE.FRAGMENT)).toBe(true);
    expect(candidateIds).toContain(otherDomain.id);
    expect(candidateIds).not.toContain(feedback.id);
    expect(candidateIds).not.toContain(domain.id);
  });

  it("returns no candidates for a KNOWLEDGE fragment's child picker", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const domain: Fragment = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);
    const knowledge = await createChildFragment(harness, FRAGMENT_KIND.KNOWLEDGE, domain.id, "fact");

    const candidates = await fetchCandidates(harness, knowledge.id, RELATIONSHIP_DIRECTION.SOURCE);

    expect(candidates).toEqual([]);
  });

  it("rejects a missing or invalid direction", async () => {
    const harness = await createHarness([AGENT_ID_A]);
    const root = await createRootFragment(harness, FRAGMENT_KIND.DOMAIN, AGENT_ID_A);

    const response = await harness.server.inject({
      method: "GET",
      url: `/api/fragments/${root.id}/relationship-candidates`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(APP_ERROR_CODES.VALIDATION);
  });
});
