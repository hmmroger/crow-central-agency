import { describe, expect, it, vi } from "vitest";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  type Entity,
  type Tag,
} from "@crow-central-agency/shared";
import { TAG_STORE_TABLE, TagManager } from "./tag-manager.js";
import { RelationshipManager } from "../relationship-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

interface Harness {
  store: InMemoryObjectStore;
  relationshipManager: RelationshipManager;
  broadcaster: WsBroadcaster;
  tagManager: TagManager;
}

async function createHarness(store = new InMemoryObjectStore()): Promise<Harness> {
  const relationshipManager = new RelationshipManager(store);
  const broadcaster = new WsBroadcaster();
  const tagManager = new TagManager(store, relationshipManager, broadcaster);
  await relationshipManager.initialize();
  await tagManager.initialize();

  return { store, relationshipManager, broadcaster, tagManager };
}

function note(id: string): Entity {
  return { id, entityType: ENTITY_TYPE.NOTE };
}

function agent(id: string): Entity {
  return { id, entityType: ENTITY_TYPE.AGENT };
}

function entityTagNames(harness: Harness, entity: Entity): string[] {
  return harness.tagManager
    .getEntityTags(entity)
    .map((tag) => tag.name)
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

    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: [" Alpha ", "beta", "ALPHA", ""] },
      { entity: note("note-b"), tagNames: ["beta"] },
    ]);

    expect(entityTagNames(harness, note("note-a"))).toEqual(["alpha", "beta"]);
    expect(entityTagNames(harness, note("note-b"))).toEqual(["beta"]);
    expect(await storedTagNames(harness.store)).toEqual(["alpha", "beta"]);
    expect(harness.tagManager.findTagByName(" BETA ")?.name).toBe("beta");
  });

  it("treats composed and decomposed spellings of a name as one tag", async () => {
    const harness = await createHarness();
    const composed = "café";
    const decomposed = "café";

    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: [composed] },
      { entity: note("note-b"), tagNames: [decomposed.toUpperCase()] },
    ]);

    expect(entityTagNames(harness, note("note-a"))).toEqual([composed]);
    expect(entityTagNames(harness, note("note-b"))).toEqual([composed]);
    expect(await storedTagNames(harness.store)).toEqual([composed]);
    expect(harness.tagManager.findTagByName(decomposed)?.name).toBe(composed);
  });

  it("replaces changed tags and deletes tags left without edges", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: ["alpha", "beta"] },
      { entity: note("note-b"), tagNames: ["beta"] },
    ]);
    const betaId = tagIdByName(harness, "beta");

    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["beta", "gamma"] }]);

    expect(entityTagNames(harness, note("note-a"))).toEqual(["beta", "gamma"]);
    expect(entityTagNames(harness, note("note-b"))).toEqual(["beta"]);
    expect(harness.tagManager.findTagByName("alpha")).toBeUndefined();
    expect(harness.tagManager.findTagByName("beta")?.id).toBe(betaId);
    expect(await storedTagNames(harness.store)).toEqual(["beta", "gamma"]);
  });

  it("clears an entity's tags for an empty list", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);

    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: [] }]);

    expect(entityTagNames(harness, note("note-a"))).toEqual([]);
    expect(await storedTagNames(harness.store)).toEqual([]);
  });

  it("sets the tags of entities of different types in one call", async () => {
    const harness = await createHarness();

    await harness.tagManager.setEntityTags([
      { entity: note("shared-id"), tagNames: ["alpha"] },
      { entity: agent("shared-id"), tagNames: ["beta"] },
    ]);

    expect(entityTagNames(harness, note("shared-id"))).toEqual(["alpha"]);
    expect(entityTagNames(harness, agent("shared-id"))).toEqual(["beta"]);
  });

  it("leaves the tags of the same id under another entity type untouched", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: agent("shared-id"), tagNames: ["alpha"] }]);

    await harness.tagManager.setEntityTags([{ entity: note("shared-id"), tagNames: [] }]);

    expect(entityTagNames(harness, agent("shared-id"))).toEqual(["alpha"]);
  });

  it("rejects an empty entity id", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);

    await expectAppErrorCode(
      harness.tagManager.setEntityTags([{ entity: note(""), tagNames: [] }]),
      APP_ERROR_CODES.VALIDATION
    );

    expect(entityTagNames(harness, note("note-a"))).toEqual(["alpha"]);
  });

  it("rejects the same entity listed twice without writing", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(
      harness.tagManager.setEntityTags([
        { entity: note("note-a"), tagNames: ["alpha"] },
        { entity: note("note-a"), tagNames: ["beta"] },
      ]),
      APP_ERROR_CODES.VALIDATION
    );

    expect(entityTagNames(harness, note("note-a"))).toEqual([]);
    expect(await storedTagNames(harness.store)).toEqual([]);
  });

  it("serializes concurrent calls so a name is created once", async () => {
    const harness = await createHarness();

    await Promise.all([
      harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]),
      harness.tagManager.setEntityTags([{ entity: note("note-b"), tagNames: ["alpha"] }]),
    ]);

    expect(await storedTagNames(harness.store)).toEqual(["alpha"]);
    expect(entityTagNames(harness, note("note-a"))).toEqual(["alpha"]);
    expect(entityTagNames(harness, note("note-b"))).toEqual(["alpha"]);
  });
});

describe("TagManager.initialize", () => {
  it("deletes tags left without a TAGGED edge", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([
      { entity: agent("agent-a"), tagNames: ["alpha"] },
      { entity: agent("agent-b"), tagNames: ["beta"] },
    ]);
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
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);
    const alphaId = tagIdByName(harness, "alpha");

    const relationship = await harness.tagManager.tagEntity(agent("agent-a"), alphaId);

    expect(relationship).toMatchObject({
      sourceEntityId: "agent-a",
      targetEntityId: alphaId,
      targetEntityType: ENTITY_TYPE.TAG,
      relationshipType: RELATIONSHIP_TYPE.TAGGED,
    });
  });

  it("rejects a tag as the tagged entity", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha", "beta"] }]);
    const betaTag: Entity = { id: tagIdByName(harness, "beta"), entityType: ENTITY_TYPE.TAG };

    await expectAppErrorCode(
      harness.tagManager.tagEntity(betaTag, tagIdByName(harness, "alpha")),
      APP_ERROR_CODES.VALIDATION
    );
    await expectAppErrorCode(
      harness.tagManager.setEntityTags([{ entity: betaTag, tagNames: ["alpha"] }]),
      APP_ERROR_CODES.VALIDATION
    );
    expect(harness.relationshipManager.queryRelationships({ sourceEntityType: ENTITY_TYPE.TAG })).toEqual([]);
  });

  it("rejects an unknown tag", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(harness.tagManager.tagEntity(agent("agent-a"), "unknown"), APP_ERROR_CODES.TAG_NOT_FOUND);
  });

  it("deletes the tag with its last edge only", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: ["alpha"] },
      { entity: note("note-b"), tagNames: ["alpha"] },
    ]);
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

describe("TagManager TAGS_CHANGED", () => {
  it("broadcasts one message per setEntityTags batch, with tags left unused", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);
    const alphaId = tagIdByName(harness, "alpha");
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: ["beta"] },
      { entity: agent("agent-a"), tagNames: ["beta"] },
    ]);

    const betaId = tagIdByName(harness, "beta");
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
      tags: [harness.tagManager.getTag(betaId)],
      removedEdges: [{ tagId: alphaId, entity: note("note-a") }],
      addedEdges: [
        { tagId: betaId, entity: note("note-a") },
        { tagId: betaId, entity: agent("agent-a") },
      ],
      deletedTagIds: [alphaId],
    });
  });

  it("broadcasts nothing when the tags already match", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["Alpha"] }]);

    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it("carries the record of an existing tag a new edge points at", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: agent("agent-a"), tagNames: ["alpha"] }]);
    const alphaTag = harness.tagManager.getTag(tagIdByName(harness, "alpha"));
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);

    expect(broadcastSpy).toHaveBeenCalledWith({
      type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
      tags: [alphaTag],
      removedEdges: [],
      addedEdges: [{ tagId: alphaTag.id, entity: note("note-a") }],
      deletedTagIds: [],
    });
  });

  it("broadcasts the edge of tagEntity and untagEntity", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);
    const alphaId = tagIdByName(harness, "alpha");
    const alphaTag = harness.tagManager.getTag(alphaId);
    const [noteEdge] = harness.relationshipManager.queryRelationships({ sourceEntityId: "note-a" });
    const agentEdge = { tagId: alphaId, entity: agent("agent-a") };
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    const relationship = await harness.tagManager.tagEntity(agent("agent-a"), alphaId);
    await harness.tagManager.untagEntity(noteEdge.id);
    await harness.tagManager.untagEntity(relationship.id);

    expect(broadcastSpy.mock.calls).toEqual([
      [
        {
          type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
          tags: [alphaTag],
          removedEdges: [],
          addedEdges: [agentEdge],
          deletedTagIds: [],
        },
      ],
      [
        {
          type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
          tags: [],
          removedEdges: [{ tagId: alphaId, entity: note("note-a") }],
          addedEdges: [],
          deletedTagIds: [],
        },
      ],
      [
        {
          type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
          tags: [],
          removedEdges: [agentEdge],
          addedEdges: [],
          deletedTagIds: [alphaId],
        },
      ],
    ]);
  });

  it("broadcasts nothing on initialize", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: agent("agent-a"), tagNames: ["alpha"] }]);
    await harness.relationshipManager.removeRelationshipsForEntity("agent-a");
    const broadcaster = new WsBroadcaster();
    const broadcastSpy = vi.spyOn(broadcaster, "broadcast");

    await new TagManager(harness.store, harness.relationshipManager, broadcaster).initialize();

    expect(await storedTagNames(harness.store)).toEqual([]);
    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});

describe("TagManager.changeEntityIds", () => {
  it("moves only TAGGED edges and announces each moved edge", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([{ entity: note("note-a"), tagNames: ["alpha"] }]);
    const alphaId = tagIdByName(harness, "alpha");
    const association = await harness.relationshipManager.createRelationship({
      sourceEntityId: "agent-a",
      sourceEntityType: ENTITY_TYPE.AGENT,
      targetEntityId: "note-a",
      targetEntityType: ENTITY_TYPE.NOTE,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    await harness.tagManager.changeEntityIds(new Map([["note-a", note("note-b")]]));

    expect(entityTagNames(harness, note("note-a"))).toEqual([]);
    expect(entityTagNames(harness, note("note-b"))).toEqual(["alpha"]);
    expect(harness.relationshipManager.getRelationship(association.id).targetEntityId).toBe("note-a");
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledWith({
      type: SERVER_MESSAGE_TYPE.TAGS_CHANGED,
      tags: [harness.tagManager.getTag(alphaId)],
      removedEdges: [{ tagId: alphaId, entity: note("note-a") }],
      addedEdges: [{ tagId: alphaId, entity: note("note-b") }],
      deletedTagIds: [],
    });
  });

  it("broadcasts nothing when no TAGGED edge moves", async () => {
    const harness = await createHarness();
    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    await harness.tagManager.changeEntityIds(new Map([["note-a", note("note-b")]]));

    expect(broadcastSpy).not.toHaveBeenCalled();
  });
});

describe("TagManager.getSnapshot", () => {
  it("returns every tag and edge without a filter", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: ["alpha"] },
      { entity: agent("agent-a"), tagNames: ["beta"] },
    ]);

    const snapshot = harness.tagManager.getSnapshot();

    expect(snapshot.tags.map((tag) => tag.name).sort()).toEqual(["alpha", "beta"]);
    expect(snapshot.edges).toHaveLength(2);
  });

  it("keeps only the entity type's edges and the tags they use", async () => {
    const harness = await createHarness();
    await harness.tagManager.setEntityTags([
      { entity: note("note-a"), tagNames: ["alpha", "beta"] },
      { entity: agent("agent-a"), tagNames: ["beta", "gamma"] },
    ]);

    const snapshot = harness.tagManager.getSnapshot(ENTITY_TYPE.AGENT);

    expect(snapshot.tags.map((tag) => tag.name).sort()).toEqual(["beta", "gamma"]);
    expect(snapshot.edges.map((edge) => edge.entity)).toEqual([agent("agent-a"), agent("agent-a")]);
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
