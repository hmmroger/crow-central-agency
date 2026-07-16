import { describe, expect, it, vi } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_REFLECTION_AGENT_ID,
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  type Fragment,
  type FragmentKind,
} from "@crow-central-agency/shared";
import { FRAGMENT_STORE_TABLE, FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";
import { RelationshipManager } from "../relationship-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_FRAGMENT_ID = "33333333-3333-4333-8333-333333333333";

interface Harness {
  fragmentStore: InMemoryObjectStore;
  indexStore: InMemoryObjectStore;
  relationshipManager: RelationshipManager;
  fragmentManager: FragmentManager;
  broadcaster: WsBroadcaster;
}

async function createHarness(): Promise<Harness> {
  const fragmentStore = new InMemoryObjectStore();
  const indexStore = new InMemoryObjectStore();
  const relationshipStore = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(relationshipStore);
  const broadcaster = new WsBroadcaster();
  const fragmentManager = new FragmentManager(fragmentStore, indexStore, relationshipManager, broadcaster);
  await relationshipManager.initialize();
  await fragmentManager.initialize();

  return { fragmentStore, indexStore, relationshipManager, fragmentManager, broadcaster };
}

function agentParent(agentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
}

function fragmentParent(fragmentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: fragmentId };
}

async function createFragment(
  harness: Harness,
  kind: FragmentKind,
  parent: FragmentParent,
  cue = `${kind} cue`
): Promise<Fragment> {
  return harness.fragmentManager.createFragment({ kind, cue, body: `${kind} body`, parent });
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

describe("FragmentManager.createFragment parent rules", () => {
  it.each([FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.LESSON, FRAGMENT_KIND.DOMAIN])(
    "allows %s directly under an agent and creates the ASSOCIATION edge",
    async (kind) => {
      const harness = await createHarness();
      const fragment = await createFragment(harness, kind, agentParent(AGENT_ID_A));

      const edges = harness.relationshipManager.queryRelationships({
        sourceEntityId: AGENT_ID_A,
        targetEntityId: fragment.id,
        relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
      });
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceEntityType).toBe(ENTITY_TYPE.AGENT);
      expect(edges[0].targetEntityType).toBe(ENTITY_TYPE.FRAGMENT);
    }
  );

  it("rejects KNOWLEDGE directly under an agent", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(
      createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, agentParent(AGENT_ID_A)),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it.each([
    [FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.LESSON],
    [FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.DOMAIN],
    [FRAGMENT_KIND.LESSON, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.LESSON, FRAGMENT_KIND.LESSON],
    [FRAGMENT_KIND.LESSON, FRAGMENT_KIND.DOMAIN],
    [FRAGMENT_KIND.DOMAIN, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.DOMAIN, FRAGMENT_KIND.LESSON],
    [FRAGMENT_KIND.DOMAIN, FRAGMENT_KIND.DOMAIN],
    [FRAGMENT_KIND.KNOWLEDGE, FRAGMENT_KIND.DOMAIN],
  ])("allows %s under a %s fragment and creates the LINK edge", async (childKind, parentKind) => {
    const harness = await createHarness();
    const parent = await createFragment(harness, parentKind, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, childKind, fragmentParent(parent.id));

    const edges = harness.relationshipManager.queryRelationships({
      sourceEntityId: parent.id,
      targetEntityId: child.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(edges).toHaveLength(1);
  });

  it.each([
    [FRAGMENT_KIND.KNOWLEDGE, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.KNOWLEDGE, FRAGMENT_KIND.LESSON],
  ])("rejects %s under a %s fragment (KNOWLEDGE only under DOMAIN)", async (childKind, parentKind) => {
    const harness = await createHarness();
    const parent = await createFragment(harness, parentKind, agentParent(AGENT_ID_A));

    await expectAppErrorCode(createFragment(harness, childKind, fragmentParent(parent.id)), APP_ERROR_CODES.VALIDATION);
  });

  it.each([FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.LESSON, FRAGMENT_KIND.DOMAIN, FRAGMENT_KIND.KNOWLEDGE])(
    "rejects %s under a KNOWLEDGE fragment (KNOWLEDGE is a leaf)",
    async (childKind) => {
      const harness = await createHarness();
      const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
      const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

      await expectAppErrorCode(
        createFragment(harness, childKind, fragmentParent(knowledge.id)),
        APP_ERROR_CODES.VALIDATION
      );
    }
  );

  it("rejects an unknown parent fragment without persisting anything", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(
      createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(UNKNOWN_FRAGMENT_ID)),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
    expect(await harness.fragmentStore.size(FRAGMENT_STORE_TABLE)).toBe(0);
    expect(harness.relationshipManager.getAllRelationships()).toHaveLength(0);
  });
});

describe("FragmentManager word cap", () => {
  it("accepts a body at exactly FRAGMENT_MAX_WORDS words", async () => {
    const harness = await createHarness();
    const body = Array.from({ length: FRAGMENT_MAX_WORDS }, (_, index) => `word${index}`).join(" ");
    const fragment = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.LESSON,
      cue: "cap cue",
      body,
      parent: agentParent(AGENT_ID_A),
    });

    expect(fragment.body).toBe(body);
  });

  it("rejects an over-cap body on create", async () => {
    const harness = await createHarness();
    const body = Array.from({ length: FRAGMENT_MAX_WORDS + 1 }, (_, index) => `word${index}`).join(" ");

    await expectAppErrorCode(
      harness.fragmentManager.createFragment({
        kind: FRAGMENT_KIND.LESSON,
        cue: "cap cue",
        body,
        parent: agentParent(AGENT_ID_A),
      }),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("rejects an over-cap body on update", async () => {
    const harness = await createHarness();
    const fragment = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));
    const body = Array.from({ length: FRAGMENT_MAX_WORDS + 1 }, (_, index) => `word${index}`).join(" ");

    await expectAppErrorCode(harness.fragmentManager.updateFragment(fragment.id, { body }), APP_ERROR_CODES.VALIDATION);
  });
});

describe("FragmentManager.createLink", () => {
  it("rejects a link that would close a cycle", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainA.id));
    const domainC = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainB.id));

    await expectAppErrorCode(harness.fragmentManager.createLink(domainC.id, domainA.id), APP_ERROR_CODES.VALIDATION);
  });

  it("rejects a self-link", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(harness.fragmentManager.createLink(domain.id, domain.id), APP_ERROR_CODES.VALIDATION);
  });

  it("allows a diamond (second parent for a non-KNOWLEDGE fragment)", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainA.id));

    const link = await harness.fragmentManager.createLink(domainB.id, child.id);

    expect(link.relationshipType).toBe(RELATIONSHIP_TYPE.LINK);
  });

  it("allows a KNOWLEDGE fragment under two DOMAINs (DAG multi-parent)", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await harness.fragmentManager.createLink(domainB.id, knowledge.id);

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks.map((link) => link.sourceEntityId).sort()).toEqual([domainA.id, domainB.id].sort());
  });

  it("still rejects a kind mismatch (KNOWLEDGE only hangs under a DOMAIN)", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(harness.fragmentManager.createLink(feedback.id, knowledge.id), APP_ERROR_CODES.VALIDATION);
  });
});

describe("FragmentManager.removeLink", () => {
  it("removes an existing link", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainA.id));

    await harness.fragmentManager.removeLink(domainA.id, domainB.id);

    const links = harness.relationshipManager.queryRelationships({ relationshipType: RELATIONSHIP_TYPE.LINK });
    expect(links).toHaveLength(0);
  });

  it("unlinks a KNOWLEDGE fragment so a composed move can re-parent it", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await harness.fragmentManager.removeLink(domainA.id, knowledge.id);
    await harness.fragmentManager.createLink(domainB.id, knowledge.id);

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks).toHaveLength(1);
    expect(parentLinks[0].sourceEntityId).toBe(domainB.id);
  });

  it("throws RELATIONSHIP_NOT_FOUND for a missing link", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.removeLink(domainA.id, domainB.id),
      APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
    );
  });
});

describe("FragmentManager.unlinkFragment cascade-GC", () => {
  it("keeps a shared fragment when one of its two incoming edges is removed", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, domain.id);

    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domain.id);

    expect(collected).toEqual([]);
    await expect(harness.fragmentManager.readFragment(domain.id)).resolves.toBeDefined();
    expect(harness.fragmentManager.getAgentsReachingFragment(domain.id)).toEqual([AGENT_ID_B]);
  });

  it("collects a fragment only when its last incoming edge is removed", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, domain.id);

    await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domain.id);
    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_B), domain.id);

    expect(collected).toEqual([domain.id]);
    await expectAppErrorCode(harness.fragmentManager.readFragment(domain.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
    expect(await harness.fragmentManager.getFragmentCue(domain.id)).toBeUndefined();
  });

  it("keeps a diamond child while one LINK parent remains and collects it when both are gone", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainA.id));
    await harness.fragmentManager.createLink(domainB.id, child.id);

    const afterFirst = await harness.fragmentManager.unlinkFragment(fragmentParent(domainA.id), child.id);
    expect(afterFirst).toEqual([]);
    await expect(harness.fragmentManager.readFragment(child.id)).resolves.toBeDefined();

    const afterSecond = await harness.fragmentManager.unlinkFragment(fragmentParent(domainB.id), child.id);
    expect(afterSecond).toEqual([child.id]);
    await expectAppErrorCode(harness.fragmentManager.readFragment(child.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  });

  it("collapses a deep chain when its root edge is removed", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domain.id);

    expect(collected).toEqual([domain.id, subDomain.id, knowledge.id]);
    expect(harness.relationshipManager.queryRelationships({ relationshipType: RELATIONSHIP_TYPE.LINK })).toHaveLength(
      0
    );
    expect(
      harness.relationshipManager.queryRelationships({ relationshipType: RELATIONSHIP_TYPE.ASSOCIATION })
    ).toHaveLength(0);
    for (const fragmentId of collected) {
      await expectAppErrorCode(harness.fragmentManager.readFragment(fragmentId), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
    }
  });

  it("spares a descendant still reachable another way while collecting the rest", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domainA.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));
    await harness.fragmentManager.createLink(domainB.id, subDomain.id);

    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domainA.id);

    expect(collected).toEqual([domainA.id]);
    await expect(harness.fragmentManager.readFragment(subDomain.id)).resolves.toBeDefined();
    await expect(harness.fragmentManager.readFragment(knowledge.id)).resolves.toBeDefined();
  });

  it("emits fragmentDeleted for every collected fragment", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    const deletedIds: string[] = [];
    harness.fragmentManager.on("fragmentDeleted", (event) => {
      deletedIds.push(event.fragmentId);
    });

    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domain.id);
    // EventBus defers listeners via setImmediate; flush before asserting
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(collected).toEqual([domain.id, subDomain.id, knowledge.id]);
    expect(deletedIds).toEqual(collected);
  });

  it("throws RELATIONSHIP_NOT_FOUND when the named edge does not exist", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_B), domain.id),
      APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
    );
    await expect(harness.fragmentManager.readFragment(domain.id)).resolves.toBeDefined();
  });
});

describe("FragmentManager relationship broadcasts", () => {
  it("broadcasts relationship_created for named edge writes and relationship_deleted for their removals", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    const association = await harness.fragmentManager.createAssociation(AGENT_ID_B, domainA.id);
    const link = await harness.fragmentManager.createLink(domainB.id, knowledge.id);
    await harness.fragmentManager.removeAssociation(AGENT_ID_B, domainA.id);
    await harness.fragmentManager.removeLink(domainB.id, knowledge.id);

    expect(broadcastSpy.mock.calls.map(([message]) => message)).toEqual([
      { type: SERVER_MESSAGE_TYPE.RELATIONSHIP_CREATED, relationship: association },
      { type: SERVER_MESSAGE_TYPE.RELATIONSHIP_CREATED, relationship: link },
      { type: SERVER_MESSAGE_TYPE.RELATIONSHIP_DELETED, relationshipId: association.id },
      { type: SERVER_MESSAGE_TYPE.RELATIONSHIP_DELETED, relationshipId: link.id },
    ]);
  });

  it("broadcasts one fragment_deleted per collected fragment and stays silent on purge-time edge strips", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    const broadcastSpy = vi.spyOn(harness.broadcaster, "broadcast");

    const collected = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), domain.id);

    const messages = broadcastSpy.mock.calls.map(([message]) => message);
    const fragmentDeleted = messages.filter((message) => message.type === SERVER_MESSAGE_TYPE.FRAGMENT_DELETED);
    const relationshipDeleted = messages.filter((message) => message.type === SERVER_MESSAGE_TYPE.RELATIONSHIP_DELETED);

    expect(collected).toEqual([domain.id, knowledge.id]);
    expect(fragmentDeleted).toEqual(
      collected.map((fragmentId) => ({ type: SERVER_MESSAGE_TYPE.FRAGMENT_DELETED, fragmentId }))
    );
    // Only the named unlink edge broadcasts; the cascade's stripped edges do not
    expect(relationshipDeleted).toHaveLength(1);
  });
});

describe("FragmentManager scope resolution", () => {
  it("resolves every fragment reachable from an agent's associations", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    const scoped = harness.fragmentManager.getScopedFragmentIds(AGENT_ID_A);

    expect(scoped).toEqual(new Set([domain.id, knowledge.id, feedback.id]));
    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_B).size).toBe(0);
  });

  it("makes a shared fragment and its subtree reachable by every associated agent", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await harness.fragmentManager.createAssociation(AGENT_ID_B, domain.id);

    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_B)).toEqual(new Set([domain.id, knowledge.id]));
    expect(harness.fragmentManager.getAgentsReachingFragment(knowledge.id).sort()).toEqual(
      [AGENT_ID_A, AGENT_ID_B].sort()
    );
  });

  it("shrinks scope when an association is removed", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, domain.id);

    await harness.fragmentManager.removeAssociation(AGENT_ID_B, domain.id);

    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_B).size).toBe(0);
    expect(harness.fragmentManager.getAgentsReachingFragment(domain.id)).toEqual([AGENT_ID_A]);
  });

  it("throws RELATIONSHIP_NOT_FOUND when removing a missing association", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.removeAssociation(AGENT_ID_B, domain.id),
      APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
    );
  });
});

describe("FragmentManager.isFragmentAccessible", () => {
  it("grants access to anchored fragments and every descendant reachable through them", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_A, domain.id)).toBe(true);
    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_A, knowledge.id)).toBe(true);
  });

  it("denies access outside the agent's reachability and for unknown fragments", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_B, domain.id)).toBe(false);
    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_A, UNKNOWN_FRAGMENT_ID)).toBe(false);
  });

  it("grants access through a sharing association on an ancestor and revokes it on unshare", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await harness.fragmentManager.createAssociation(AGENT_ID_B, domain.id);
    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_B, knowledge.id)).toBe(true);

    await harness.fragmentManager.removeAssociation(AGENT_ID_B, domain.id);
    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_B, knowledge.id)).toBe(false);
  });
});

describe("FragmentManager.createAssociation parent matrix", () => {
  it("rejects associating a KNOWLEDGE fragment directly to an agent", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(
      harness.fragmentManager.createAssociation(AGENT_ID_B, knowledge.id),
      APP_ERROR_CODES.VALIDATION
    );
  });
});

describe("FragmentManager optimistic concurrency", () => {
  it("rejects an update with a stale expectedUpdatedTimestamp", async () => {
    const harness = await createHarness();
    const fragment = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.updateFragment(fragment.id, {
        cue: "second update",
        expectedUpdatedTimestamp: fragment.updatedTimestamp - 1,
      }),
      APP_ERROR_CODES.CONFLICT
    );
  });

  it("accepts an update with the current expectedUpdatedTimestamp", async () => {
    const harness = await createHarness();
    const fragment = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    const updated = await harness.fragmentManager.updateFragment(fragment.id, {
      cue: "updated cue",
      expectedUpdatedTimestamp: fragment.updatedTimestamp,
    });

    expect(updated.cue).toBe("updated cue");
  });
});

describe("FragmentManager.resolveDomain", () => {
  it("resolves a DOMAIN to itself and children to the nearest ancestor DOMAIN", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domain.id));
    const nestedFeedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(feedback.id));

    expect(await harness.fragmentManager.resolveDomain(domain.id)).toEqual([domain.id]);
    expect(await harness.fragmentManager.resolveDomain(knowledge.id)).toEqual([domain.id]);
    expect(await harness.fragmentManager.resolveDomain(feedback.id)).toEqual([domain.id]);
    expect(await harness.fragmentManager.resolveDomain(nestedFeedback.id)).toEqual([domain.id]);
  });

  it("resolves a KNOWLEDGE fragment under two DOMAINs to both", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));
    await harness.fragmentManager.createLink(domainB.id, knowledge.id);

    const domains = await harness.fragmentManager.resolveDomain(knowledge.id);

    expect(domains.sort()).toEqual([domainA.id, domainB.id].sort());
  });

  it("stops at the nearest DOMAIN and never ascends past it", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    expect(await harness.fragmentManager.resolveDomain(knowledge.id)).toEqual([subDomain.id]);
    expect(await harness.fragmentManager.resolveDomain(subDomain.id)).toEqual([subDomain.id]);
  });

  it("returns an empty set for a fragment with no DOMAIN ancestry", async () => {
    const harness = await createHarness();
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    expect(await harness.fragmentManager.resolveDomain(feedback.id)).toEqual([]);
  });
});

describe("FragmentManager.getChildFragmentCues", () => {
  it("returns the cue entries of direct children only", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    const childCues = await harness.fragmentManager.getChildFragmentCues(domain.id);

    expect(childCues.map((entry) => entry.id).sort()).toEqual([knowledge.id, subDomain.id].sort());
  });
});

describe("FragmentManager.getAllFragmentCues", () => {
  it("returns every indexed cue and drops entries removed from the index", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_B));

    const allCues = await harness.fragmentManager.getAllFragmentCues();
    expect(allCues.map((entry) => entry.id).sort()).toEqual([domain.id, knowledge.id, feedback.id].sort());
    expect(allCues.find((entry) => entry.id === feedback.id)?.cue).toBe(feedback.cue);
    expect(allCues.find((entry) => entry.id === feedback.id)?.kind).toBe(FRAGMENT_KIND.FEEDBACK);

    await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_B), feedback.id);

    const remainingCues = await harness.fragmentManager.getAllFragmentCues();
    expect(remainingCues.map((entry) => entry.id).sort()).toEqual([domain.id, knowledge.id].sort());
  });
});

describe("FragmentManager reflection allowance", () => {
  it("grants the reflection agent access to any fragment without an association of its own", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    expect(harness.fragmentManager.isFragmentAccessible(FRAGMENT_REFLECTION_AGENT_ID, domain.id)).toBe(true);
    expect(harness.fragmentManager.isFragmentAccessible(FRAGMENT_REFLECTION_AGENT_ID, knowledge.id)).toBe(true);
  });

  it("prunes a target's sole-reached leaf through the caller-independent unlink", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    const collectedIds = await harness.fragmentManager.unlinkFragment(agentParent(AGENT_ID_A), lesson.id);

    expect(collectedIds).toEqual([lesson.id]);
    await expectAppErrorCode(harness.fragmentManager.readFragment(lesson.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  });
});
