import { describe, expect, it } from "vitest";
import { ENTITY_TYPE, RELATIONSHIP_TYPE, type EntityType, type Tag } from "@crow-central-agency/shared";
import { TAG_STORE_TABLE, TagManager } from "./tag-manager.js";
import { RelationshipManager } from "../relationship-manager.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

interface Harness {
  store: InMemoryObjectStore;
  relationshipManager: RelationshipManager;
  tagManager: TagManager;
}

async function createHarness(store = new InMemoryObjectStore()): Promise<Harness> {
  const relationshipManager = new RelationshipManager(store);
  const tagManager = new TagManager(store, relationshipManager);
  await relationshipManager.initialize();
  await tagManager.initialize();

  return { store, relationshipManager, tagManager };
}

function entityTagNames(harness: Harness, entityId: string, entityType: EntityType = ENTITY_TYPE.NOTE): string[] {
  return harness.relationshipManager
    .queryRelationships({
      sourceEntityId: entityId,
      sourceEntityType: entityType,
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    })
    .map((relationship) => harness.tagManager.getTag(relationship.targetEntityId).name)
    .sort();
}

function tagIdByName(harness: Harness, name: string): string {
  const tag = harness.tagManager.findTagByName(name);
  if (!tag) {
    throw new Error(`Missing tag: ${name}`);
  }

  return tag.id;
}

async function storedTagNames(store: InMemoryObjectStore): Promise<string[]> {
  const entries = await store.getAll<Tag>(TAG_STORE_TABLE);

  return entries.map((entry) => entry.value.name).sort();
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

describe("TagManager.setEntityTags", () => {
  it("normalizes names, creates tag records and TAGGED edges", async () => {
    const harness = await createHarness();

    await harness.tagManager.setEntityTags(
      ENTITY_TYPE.NOTE,
      new Map([
        ["note-a", [" Alpha ", "beta", "ALPHA", ""]],
        ["note-b", ["beta"]],
      ])
    );

    expect(entityTagNames(harness, "note-a")).toEqual(["alpha", "beta"]);
    expect(entityTagNames(harness, "note-b")).toEqual(["beta"]);
    expect(await storedTagNames(harness.store)).toEqual(["alpha", "beta"]);
    expect(harness.tagManager.findTagByName(" BETA ")?.name).toBe("beta");
  });

  it("replaces changed tags and deletes tags left without edges", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(
      ENTITY_TYPE.NOTE,
      new Map([
        ["note-a", ["alpha", "beta"]],
        ["note-b", ["beta"]],
      ])
    );
    const betaId = tagIdByName(harness, "beta");

    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["beta", "gamma"]]]));

    expect(entityTagNames(harness, "note-a")).toEqual(["beta", "gamma"]);
    expect(entityTagNames(harness, "note-b")).toEqual(["beta"]);
    expect(harness.tagManager.findTagByName("alpha")).toBeUndefined();
    expect(harness.tagManager.findTagByName("beta")?.id).toBe(betaId);
    expect(await storedTagNames(harness.store)).toEqual(["beta", "gamma"]);
  });

  it("clears an entity's tags for an empty list", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha"]]]));

    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", []]]));

    expect(entityTagNames(harness, "note-a")).toEqual([]);
    expect(await storedTagNames(harness.store)).toEqual([]);
  });

  it("leaves the tags of the same id under another entity type untouched", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(ENTITY_TYPE.AGENT, new Map([["shared-id", ["alpha"]]]));

    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["shared-id", []]]));

    expect(entityTagNames(harness, "shared-id", ENTITY_TYPE.AGENT)).toEqual(["alpha"]);
  });

  it("rejects an empty entity id", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha"]]]));

    await expectAppErrorCode(
      harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["", []]])),
      APP_ERROR_CODES.VALIDATION
    );

    expect(entityTagNames(harness, "note-a")).toEqual(["alpha"]);
  });

  it("serializes concurrent calls so a name is created once", async () => {
    const harness = await createHarness();

    await Promise.all([
      harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha"]]])),
      harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-b", ["alpha"]]])),
    ]);

    expect(await storedTagNames(harness.store)).toEqual(["alpha"]);
    expect(entityTagNames(harness, "note-a")).toEqual(["alpha"]);
    expect(entityTagNames(harness, "note-b")).toEqual(["alpha"]);
  });
});

describe("TagManager.reconcileEntityTags", () => {
  it("clears entities of the type missing from the map and deletes unused tags", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(
      ENTITY_TYPE.NOTE,
      new Map([
        ["note-a", ["alpha"]],
        ["note-b", ["beta"]],
      ])
    );
    await harness.tagManager.setEntityTags(ENTITY_TYPE.AGENT, new Map([["agent-a", ["gamma"]]]));

    await harness.tagManager.reconcileEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha", "delta"]]]));

    expect(entityTagNames(harness, "note-a")).toEqual(["alpha", "delta"]);
    expect(entityTagNames(harness, "note-b")).toEqual([]);
    expect(entityTagNames(harness, "agent-a", ENTITY_TYPE.AGENT)).toEqual(["gamma"]);
    expect(await storedTagNames(harness.store)).toEqual(["alpha", "delta", "gamma"]);
  });
});

describe("TagManager.initialize", () => {
  it("deletes tags left without a TAGGED edge", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(
      ENTITY_TYPE.AGENT,
      new Map([
        ["agent-a", ["alpha"]],
        ["agent-b", ["beta"]],
      ])
    );
    await harness.relationshipManager.removeRelationshipsForEntity("agent-b");

    const reloaded = await createHarness(harness.store);

    expect(reloaded.tagManager.findTagByName("alpha")).toBeDefined();
    expect(reloaded.tagManager.findTagByName("beta")).toBeUndefined();
    expect(await storedTagNames(reloaded.store)).toEqual(["alpha"]);
  });
});

describe("TagManager.tagEntity / untagEntity", () => {
  it("tags an entity with an existing tag", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha"]]]));
    const alphaId = tagIdByName(harness, "alpha");

    const relationship = await harness.tagManager.tagEntity(ENTITY_TYPE.AGENT, "agent-a", alphaId);

    expect(relationship).toMatchObject({
      sourceEntityId: "agent-a",
      targetEntityId: alphaId,
      targetEntityType: ENTITY_TYPE.TAG,
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    });
  });

  it("rejects a tag as the tagged entity", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(ENTITY_TYPE.NOTE, new Map([["note-a", ["alpha", "beta"]]]));

    await expectAppErrorCode(
      harness.tagManager.tagEntity(ENTITY_TYPE.TAG, tagIdByName(harness, "beta"), tagIdByName(harness, "alpha")),
      APP_ERROR_CODES.VALIDATION
    );
    await expectAppErrorCode(
      harness.tagManager.setEntityTags(ENTITY_TYPE.TAG, new Map([[tagIdByName(harness, "beta"), ["alpha"]]])),
      APP_ERROR_CODES.VALIDATION
    );
    expect(harness.relationshipManager.queryRelationships({ sourceEntityType: ENTITY_TYPE.TAG })).toEqual([]);
  });

  it("rejects an unknown tag", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(
      harness.tagManager.tagEntity(ENTITY_TYPE.AGENT, "agent-a", "unknown"),
      APP_ERROR_CODES.TAG_NOT_FOUND
    );
  });

  it("deletes the tag with its last edge only", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags(
      ENTITY_TYPE.NOTE,
      new Map([
        ["note-a", ["alpha"]],
        ["note-b", ["alpha"]],
      ])
    );
    const [first, second] = harness.relationshipManager.queryRelationships({
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    });

    await harness.tagManager.untagEntity(first.id);
    expect(harness.tagManager.findTagByName("alpha")).toBeDefined();

    await harness.tagManager.untagEntity(second.id);
    expect(harness.tagManager.findTagByName("alpha")).toBeUndefined();
    expect(await storedTagNames(harness.store)).toEqual([]);
  });

  it("rejects a relationship that is not TAGGED", async () => {
    const harness = await createHarness();
    const link = await harness.relationshipManager.createRelationship({
      sourceEntityId: "fragment-a",
      sourceEntityType: ENTITY_TYPE.FRAGMENT,
      targetEntityId: "fragment-b",
      targetEntityType: ENTITY_TYPE.FRAGMENT,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });

    await expectAppErrorCode(harness.tagManager.untagEntity(link.id), APP_ERROR_CODES.VALIDATION);
    expect(harness.relationshipManager.getRelationship(link.id)).toEqual(link);
  });
});

describe("TagManager.getTag", () => {
  it("throws TAG_NOT_FOUND for an unknown id", async () => {
    const harness = await createHarness();

    let caught: unknown;
    try {
      harness.tagManager.getTag("unknown");
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof AppError ? caught.errorCode : undefined).toBe(APP_ERROR_CODES.TAG_NOT_FOUND);
  });
});
