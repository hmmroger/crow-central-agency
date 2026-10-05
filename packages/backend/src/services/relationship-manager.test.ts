import { describe, expect, it, vi } from "vitest";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  type CreateRelationshipInput,
  type EntityType,
  type Relationship,
  type RelationshipType,
} from "@crow-central-agency/shared";
import {
  GRAPH_NODE_POSITION_STORE_TABLE,
  RELATIONSHIP_STORE_TABLE,
  RelationshipManager,
  relationshipMatchesQuery,
} from "./relationship-manager.js";
import type { QueryRelationshipOptions } from "./relationship-manager.types.js";
import { InMemoryObjectStore } from "../core/store/in-memory-object-store.mock.js";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

interface Harness {
  store: InMemoryObjectStore;
  relationshipManager: RelationshipManager;
}

async function createHarness(store = new InMemoryObjectStore()): Promise<Harness> {
  const relationshipManager = new RelationshipManager(store);
  await relationshipManager.initialize();

  return { store, relationshipManager };
}

function edge(
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: RelationshipType = RELATIONSHIP_TYPE.LINK,
  sourceEntityType: EntityType = ENTITY_TYPE.FRAGMENT,
  targetEntityType: EntityType = ENTITY_TYPE.FRAGMENT
): CreateRelationshipInput {
  return { sourceEntityId, sourceEntityType, targetEntityId, targetEntityType, relationshipType };
}

function sortedIds(relationships: Relationship[]): string[] {
  return relationships.map((relationship) => relationship.id).sort();
}

function scanQuery(relationshipManager: RelationshipManager, options: QueryRelationshipOptions): Relationship[] {
  return relationshipManager
    .getAllRelationships()
    .filter((relationship) => relationshipMatchesQuery(relationship, options));
}

async function expectAppErrorCode(operation: Promise<unknown>, errorCode: string): Promise<void> {
  let caught: unknown;
  try {
    await operation;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(AppError);
  expect(caught instanceof AppError ? caught.errorCode : undefined).toBe(errorCode);
}

const SEED_EDGES: CreateRelationshipInput[] = [
  edge("agent-a", "circle-1", RELATIONSHIP_TYPE.MEMBERSHIP, ENTITY_TYPE.AGENT, ENTITY_TYPE.AGENT_CIRCLE),
  edge("agent-b", "circle-1", RELATIONSHIP_TYPE.MEMBERSHIP, ENTITY_TYPE.AGENT, ENTITY_TYPE.AGENT_CIRCLE),
  edge("circle-1", "circle-2", RELATIONSHIP_TYPE.MEMBERSHIP, ENTITY_TYPE.AGENT_CIRCLE, ENTITY_TYPE.AGENT_CIRCLE),
  edge("agent-a", "fragment-1", RELATIONSHIP_TYPE.ASSOCIATION, ENTITY_TYPE.AGENT, ENTITY_TYPE.FRAGMENT),
  edge("fragment-1", "fragment-2"),
  edge("fragment-2", "fragment-3"),
  edge("fragment-1", "fragment-3"),
];

const QUERY_CASES: QueryRelationshipOptions[] = [
  {},
  { sourceEntityId: "agent-a" },
  { targetEntityId: "circle-1" },
  { relationshipType: RELATIONSHIP_TYPE.LINK },
  { sourceEntityId: "fragment-1", relationshipType: RELATIONSHIP_TYPE.LINK },
  { sourceEntityId: "agent-a", targetEntityId: "fragment-1" },
  { targetEntityId: "fragment-3", relationshipType: RELATIONSHIP_TYPE.LINK, sourceEntityType: ENTITY_TYPE.FRAGMENT },
  { sourceEntityId: "agent-a", relationshipType: RELATIONSHIP_TYPE.LINK },
  { sourceEntityType: ENTITY_TYPE.AGENT },
  { targetEntityType: ENTITY_TYPE.AGENT_CIRCLE, relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP },
  { sourceEntityId: "unknown" },
  { sourceEntityId: "", relationshipType: RELATIONSHIP_TYPE.ASSOCIATION },
];

describe("RelationshipManager.queryRelationships", () => {
  it.each(QUERY_CASES)("matches the full-scan filter for %o", async (options) => {
    const { relationshipManager } = await createHarness();
    await relationshipManager.createRelationships(SEED_EDGES);

    expect(sortedIds(relationshipManager.queryRelationships(options))).toEqual(
      sortedIds(scanQuery(relationshipManager, options))
    );
  });

  it("builds indexes from the store on initialize", async () => {
    const { store, relationshipManager: seeded } = await createHarness();
    await seeded.createRelationships(SEED_EDGES);

    const { relationshipManager } = await createHarness(store);

    for (const options of QUERY_CASES) {
      expect(sortedIds(relationshipManager.queryRelationships(options))).toEqual(sortedIds(scanQuery(seeded, options)));
    }
  });

  it("reflects single creates and deletes", async () => {
    const { relationshipManager } = await createHarness();
    const relationship = await relationshipManager.createRelationship(edge("fragment-1", "fragment-2"));

    expect(relationshipManager.queryRelationships({ targetEntityId: "fragment-2" })).toEqual([relationship]);

    await relationshipManager.deleteRelationship(relationship.id);

    expect(relationshipManager.queryRelationships({ targetEntityId: "fragment-2" })).toEqual([]);
    expect(relationshipManager.queryRelationships({ relationshipType: RELATIONSHIP_TYPE.LINK })).toEqual([]);
  });
});

describe("RelationshipManager.createRelationships", () => {
  it("creates every relationship in one store persist", async () => {
    const { store, relationshipManager } = await createHarness();
    const setManySpy = vi.spyOn(store, "setMany");

    const created = await relationshipManager.createRelationships(SEED_EDGES);

    expect(created).toHaveLength(SEED_EDGES.length);
    expect(setManySpy).toHaveBeenCalledTimes(1);
    expect(await store.size(RELATIONSHIP_STORE_TABLE)).toBe(SEED_EDGES.length);
  });

  it("returns an empty list and skips the store for an empty batch", async () => {
    const { store, relationshipManager } = await createHarness();
    const setManySpy = vi.spyOn(store, "setMany");

    expect(await relationshipManager.createRelationships([])).toEqual([]);
    expect(setManySpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a duplicate within the batch", [edge("fragment-1", "fragment-2"), edge("fragment-1", "fragment-2")]],
    ["an existing relationship", [edge("fragment-3", "fragment-4"), edge("fragment-9", "fragment-8")]],
    ["a self-reference", [edge("fragment-3", "fragment-4"), edge("fragment-5", "fragment-5")]],
  ])("rejects %s and creates nothing", async (_label, inputs) => {
    const { store, relationshipManager } = await createHarness();
    await relationshipManager.createRelationship(edge("fragment-9", "fragment-8"));

    await expectAppErrorCode(relationshipManager.createRelationships(inputs), APP_ERROR_CODES.DUPLICATE_RELATIONSHIP);

    expect(relationshipManager.getAllRelationships()).toHaveLength(1);
    expect(relationshipManager.queryRelationships({ sourceEntityId: "fragment-3" })).toEqual([]);
    expect(await store.size(RELATIONSHIP_STORE_TABLE)).toBe(1);
  });

  it("allows the same endpoints with a different relationship type in one batch", async () => {
    const { relationshipManager } = await createHarness();

    const created = await relationshipManager.createRelationships([
      edge("fragment-1", "fragment-2", RELATIONSHIP_TYPE.LINK),
      edge("fragment-1", "fragment-2", RELATIONSHIP_TYPE.ASSOCIATION),
    ]);

    expect(created).toHaveLength(2);
  });
});

describe("RelationshipManager.deleteRelationships", () => {
  it("deletes every relationship in one store persist", async () => {
    const { store, relationshipManager } = await createHarness();
    const created = await relationshipManager.createRelationships(SEED_EDGES);
    const deleteManySpy = vi.spyOn(store, "deleteMany");
    const toDelete = created.slice(0, 3).map((relationship) => relationship.id);

    await relationshipManager.deleteRelationships(toDelete);

    expect(deleteManySpy).toHaveBeenCalledTimes(1);
    expect(await store.size(RELATIONSHIP_STORE_TABLE)).toBe(SEED_EDGES.length - 3);
    expect(relationshipManager.queryRelationships({ targetEntityId: "circle-1" })).toEqual([]);
    expect(relationshipManager.queryRelationships({ relationshipType: RELATIONSHIP_TYPE.MEMBERSHIP })).toEqual([]);
  });

  it("rejects an unknown id and deletes nothing", async () => {
    const { store, relationshipManager } = await createHarness();
    const created = await relationshipManager.createRelationships(SEED_EDGES);

    await expectAppErrorCode(
      relationshipManager.deleteRelationships([created[0].id, "unknown"]),
      APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
    );

    expect(relationshipManager.getAllRelationships()).toHaveLength(SEED_EDGES.length);
    expect(await store.size(RELATIONSHIP_STORE_TABLE)).toBe(SEED_EDGES.length);
  });
});

describe("RelationshipManager.rekeyEntities", () => {
  it("rewrites edge endpoints and keeps relationship ids", async () => {
    const { store, relationshipManager } = await createHarness();
    const created = await relationshipManager.createRelationships(SEED_EDGES);

    await relationshipManager.rekeyEntities(new Map([["fragment-1", "fragment-10"]]));

    expect(sortedIds(relationshipManager.getAllRelationships())).toEqual(sortedIds(created));
    expect(relationshipManager.queryRelationships({ sourceEntityId: "fragment-1" })).toEqual([]);
    expect(relationshipManager.queryRelationships({ targetEntityId: "fragment-1" })).toEqual([]);
    expect(relationshipManager.queryRelationships({ sourceEntityId: "fragment-10" })).toHaveLength(2);
    expect(relationshipManager.queryRelationships({ targetEntityId: "fragment-10" })).toHaveLength(1);

    const persisted = await store.getAll<Relationship>(RELATIONSHIP_STORE_TABLE);
    const persistedEndpoints = persisted.flatMap((entry) => [entry.value.sourceEntityId, entry.value.targetEntityId]);
    expect(persistedEndpoints).not.toContain("fragment-1");
    expect(persistedEndpoints).toContain("fragment-10");
  });

  it("applies chained mappings simultaneously", async () => {
    const { relationshipManager } = await createHarness();
    const [first, second] = await relationshipManager.createRelationships([
      edge("fragment-1", "fragment-2"),
      edge("fragment-2", "fragment-3"),
    ]);

    await relationshipManager.rekeyEntities(
      new Map([
        ["fragment-1", "fragment-2"],
        ["fragment-2", "fragment-3"],
        ["fragment-3", "fragment-4"],
      ])
    );

    expect(relationshipManager.getRelationship(first.id)).toMatchObject({
      sourceEntityId: "fragment-2",
      targetEntityId: "fragment-3",
    });
    expect(relationshipManager.getRelationship(second.id)).toMatchObject({
      sourceEntityId: "fragment-3",
      targetEntityId: "fragment-4",
    });
    expect(relationshipManager.queryRelationships({ sourceEntityId: "fragment-1" })).toEqual([]);
  });

  it("moves saved node positions to the new ids", async () => {
    const { store, relationshipManager } = await createHarness();
    await relationshipManager.savePositions([
      { id: "fragment-1", x: 1, y: 1 },
      { id: "fragment-2", x: 2, y: 2 },
      { id: "fragment-5", x: 5, y: 5 },
    ]);

    await relationshipManager.rekeyEntities(
      new Map([
        ["fragment-1", "fragment-2"],
        ["fragment-2", "fragment-3"],
        ["fragment-4", "fragment-6"],
      ])
    );

    const positions = relationshipManager.getAllPositions();
    expect(Array.from(positions.keys()).sort()).toEqual(["fragment-2", "fragment-3", "fragment-5"]);
    expect(positions.get("fragment-2")).toEqual({ id: "fragment-2", x: 1, y: 1 });
    expect(positions.get("fragment-3")).toEqual({ id: "fragment-3", x: 2, y: 2 });

    const persisted = await store.getAll<{ id: string }>(GRAPH_NODE_POSITION_STORE_TABLE);
    expect(persisted.map((entry) => entry.value.id).sort()).toEqual(["fragment-2", "fragment-3", "fragment-5"]);
  });
});

describe("RelationshipManager.removeRelationshipsForEntity", () => {
  it("removes edges on either side and the position in one relationship persist", async () => {
    const { store, relationshipManager } = await createHarness();
    const created = await relationshipManager.createRelationships(SEED_EDGES);
    await relationshipManager.savePositions([{ id: "fragment-1", x: 1, y: 1 }]);
    const deleteManySpy = vi.spyOn(store, "deleteMany");
    const expectedIds = sortedIds(
      created.filter(
        (relationship) => relationship.sourceEntityId === "fragment-1" || relationship.targetEntityId === "fragment-1"
      )
    );

    const removedIds = await relationshipManager.removeRelationshipsForEntity("fragment-1");

    expect(removedIds.sort()).toEqual(expectedIds);
    expect(deleteManySpy).toHaveBeenCalledTimes(1);
    expect(relationshipManager.getAllRelationships()).toHaveLength(SEED_EDGES.length - expectedIds.length);
    expect(relationshipManager.queryRelationships({ targetEntityId: "fragment-1" })).toEqual([]);
    expect(relationshipManager.getAllPositions().has("fragment-1")).toBe(false);
    expect(await store.size(RELATIONSHIP_STORE_TABLE)).toBe(SEED_EDGES.length - expectedIds.length);
  });

  it("returns an empty list for an entity without edges", async () => {
    const { store, relationshipManager } = await createHarness();
    await relationshipManager.createRelationships(SEED_EDGES);
    const deleteManySpy = vi.spyOn(store, "deleteMany");

    expect(await relationshipManager.removeRelationshipsForEntity("unknown")).toEqual([]);
    expect(deleteManySpy).not.toHaveBeenCalled();
  });
});

describe("RelationshipManager.canReach", () => {
  it("walks matching edges through the index", async () => {
    const { relationshipManager } = await createHarness();
    await relationshipManager.createRelationships(SEED_EDGES);
    const linkQuery = { relationshipType: RELATIONSHIP_TYPE.LINK };

    expect(relationshipManager.canReach("fragment-1", "fragment-3", linkQuery)).toBe(true);
    expect(relationshipManager.canReach("fragment-3", "fragment-1", linkQuery)).toBe(false);
    expect(relationshipManager.canReach("agent-a", "fragment-2", linkQuery)).toBe(false);
  });
});
