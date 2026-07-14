import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_REFLECTION_AGENT_ID,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
} from "@crow-central-agency/shared";
import { FRAGMENT_STORE_TABLE, FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";
import { RelationshipManager } from "../relationship-manager.js";
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
}

async function createHarness(): Promise<Harness> {
  const fragmentStore = new InMemoryObjectStore();
  const indexStore = new InMemoryObjectStore();
  const relationshipStore = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(relationshipStore);
  const fragmentManager = new FragmentManager(fragmentStore, indexStore, relationshipManager);
  await relationshipManager.initialize();
  await fragmentManager.initialize();

  return { fragmentStore, indexStore, relationshipManager, fragmentManager };
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
    [FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.DOMAIN],
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
    [FRAGMENT_KIND.FEEDBACK, FRAGMENT_KIND.LESSON],
    [FRAGMENT_KIND.LESSON, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.KNOWLEDGE, FRAGMENT_KIND.FEEDBACK],
    [FRAGMENT_KIND.KNOWLEDGE, FRAGMENT_KIND.LESSON],
  ])("rejects %s under a %s fragment", async (childKind, parentKind) => {
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

  it("rejects a second parent for a KNOWLEDGE fragment", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await expectAppErrorCode(harness.fragmentManager.createLink(domainB.id, knowledge.id), APP_ERROR_CODES.VALIDATION);
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

  it("rejects unlinking a KNOWLEDGE fragment from its parent", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(harness.fragmentManager.removeLink(domain.id, knowledge.id), APP_ERROR_CODES.VALIDATION);
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

describe("FragmentManager agent-scope enforcement", () => {
  it("lets an agent read and update fragments within its scope", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    const readFragment = await harness.fragmentManager.readFragmentForAgent(AGENT_ID_A, knowledge.id);
    expect(readFragment.id).toBe(knowledge.id);

    const updated = await harness.fragmentManager.updateFragmentForAgent(AGENT_ID_A, knowledge.id, {
      cue: "updated cue",
    });
    expect(updated.cue).toBe("updated cue");
  });

  it("reports FRAGMENT_NOT_FOUND for out-of-scope read and update", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.readFragmentForAgent(AGENT_ID_B, domain.id),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
    await expectAppErrorCode(
      harness.fragmentManager.updateFragmentForAgent(AGENT_ID_B, domain.id, { cue: "hijack" }),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
  });
});

describe("FragmentManager.createFragmentForAgent", () => {
  it("creates a fragment anchored to the acting agent or an in-scope parent", async () => {
    const harness = await createHarness();
    const domain = await harness.fragmentManager.createFragmentForAgent(AGENT_ID_A, {
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "domain cue",
      body: "domain body",
      parent: agentParent(AGENT_ID_A),
    });
    const knowledge = await harness.fragmentManager.createFragmentForAgent(AGENT_ID_A, {
      kind: FRAGMENT_KIND.KNOWLEDGE,
      cue: "knowledge cue",
      body: "knowledge body",
      parent: fragmentParent(domain.id),
    });

    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_A)).toEqual(new Set([domain.id, knowledge.id]));
  });

  it("rejects anchoring to another agent", async () => {
    const harness = await createHarness();

    await expectAppErrorCode(
      harness.fragmentManager.createFragmentForAgent(AGENT_ID_A, {
        kind: FRAGMENT_KIND.DOMAIN,
        cue: "domain cue",
        body: "domain body",
        parent: agentParent(AGENT_ID_B),
      }),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("reports FRAGMENT_NOT_FOUND for an out-of-scope parent fragment", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.createFragmentForAgent(AGENT_ID_B, {
        kind: FRAGMENT_KIND.KNOWLEDGE,
        cue: "knowledge cue",
        body: "knowledge body",
        parent: fragmentParent(domain.id),
      }),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
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

describe("FragmentManager.relinkFragment", () => {
  it("moves a fragment from its agent anchor to a fragment parent", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await harness.fragmentManager.relinkFragment(AGENT_ID_A, feedback.id, fragmentParent(domain.id));

    const associations = harness.relationshipManager.queryRelationships({
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    const links = harness.relationshipManager.queryRelationships({
      sourceEntityId: domain.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(associations).toHaveLength(0);
    expect(links).toHaveLength(1);
    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_A)).toContain(feedback.id);
  });

  it("replaces the incoming link but leaves other agents' associations untouched", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domainA.id));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, feedback.id);
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_B));

    await harness.fragmentManager.relinkFragment(AGENT_ID_B, feedback.id, fragmentParent(domainB.id));

    const oldLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainA.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const newLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainB.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(oldLinks).toHaveLength(0);
    expect(newLinks).toHaveLength(1);
    // B's own sharing association was consumed as a parent edge; only the LINK anchors it now
    expect(harness.fragmentManager.getAgentsReachingFragment(feedback.id).sort()).toEqual([AGENT_ID_B]);
  });

  it("rejects a re-link that would create a cycle and leaves edges untouched", async () => {
    const harness = await createHarness();
    const parent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(parent.id));

    await expectAppErrorCode(
      harness.fragmentManager.relinkFragment(AGENT_ID_A, parent.id, fragmentParent(child.id)),
      APP_ERROR_CODES.VALIDATION
    );
    const originalLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: parent.id,
      targetEntityId: child.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(originalLinks).toHaveLength(1);
  });

  it("moves a KNOWLEDGE fragment to another DOMAIN but rejects an agent anchor", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await harness.fragmentManager.relinkFragment(AGENT_ID_A, knowledge.id, fragmentParent(domainB.id));

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks).toHaveLength(1);
    expect(parentLinks[0].sourceEntityId).toBe(domainB.id);

    await expectAppErrorCode(
      harness.fragmentManager.relinkFragment(AGENT_ID_A, knowledge.id, agentParent(AGENT_ID_A)),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("rejects a re-link with a stale expectedUpdatedTimestamp", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));
    const updated = await harness.fragmentManager.updateFragment(feedback.id, { cue: "changed" });

    await expectAppErrorCode(
      harness.fragmentManager.relinkFragment(
        AGENT_ID_A,
        feedback.id,
        fragmentParent(domain.id),
        updated.updatedTimestamp - 1
      ),
      APP_ERROR_CODES.CONFLICT
    );
  });
});

describe("FragmentManager.deleteFragmentForAgent", () => {
  it("rejects deleting a fragment with children", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(
      harness.fragmentManager.deleteFragmentForAgent(AGENT_ID_A, domain.id),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("rejects deleting a fragment other agents can still reach", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, lesson.id);

    await expectAppErrorCode(
      harness.fragmentManager.deleteFragmentForAgent(AGENT_ID_A, lesson.id),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("deletes a sole-reached leaf and reports FRAGMENT_NOT_FOUND out of scope", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      harness.fragmentManager.deleteFragmentForAgent(AGENT_ID_B, lesson.id),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );

    await harness.fragmentManager.deleteFragmentForAgent(AGENT_ID_A, lesson.id);

    await expectAppErrorCode(harness.fragmentManager.readFragment(lesson.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  });
});

describe("FragmentManager.resolveDomain", () => {
  it("resolves a DOMAIN to itself and children to the nearest ancestor DOMAIN", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domain.id));
    const nestedFeedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(feedback.id));

    expect(await harness.fragmentManager.resolveDomain(domain.id)).toBe(domain.id);
    expect(await harness.fragmentManager.resolveDomain(knowledge.id)).toBe(domain.id);
    expect(await harness.fragmentManager.resolveDomain(feedback.id)).toBe(domain.id);
    expect(await harness.fragmentManager.resolveDomain(nestedFeedback.id)).toBe(domain.id);
  });

  it("returns undefined for a fragment with no DOMAIN ancestry", async () => {
    const harness = await createHarness();
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    expect(await harness.fragmentManager.resolveDomain(feedback.id)).toBeUndefined();
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

describe("FragmentManager reflection-curator allowance", () => {
  it("lets the reflection agent read, update, and re-link fragments outside its own scope", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    const readFragment = await harness.fragmentManager.readFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, knowledge.id);
    expect(readFragment.id).toBe(knowledge.id);

    const updated = await harness.fragmentManager.updateFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, knowledge.id, {
      cue: "curated cue",
    });
    expect(updated.cue).toBe("curated cue");

    await harness.fragmentManager.relinkFragment(
      FRAGMENT_REFLECTION_AGENT_ID,
      knowledge.id,
      fragmentParent(domainB.id)
    );

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks).toHaveLength(1);
    expect(parentLinks[0].sourceEntityId).toBe(domainB.id);
  });

  it("re-linking as the curator leaves the target's association anchor untouched", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await harness.fragmentManager.relinkFragment(FRAGMENT_REFLECTION_AGENT_ID, feedback.id, fragmentParent(domain.id));

    const associations = harness.relationshipManager.queryRelationships({
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    expect(associations).toHaveLength(1);
    expect(associations[0].sourceEntityId).toBe(AGENT_ID_A);
  });

  it("lets the reflection agent create a node under a target's fragment but not anchor to the target", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));

    const themeNode = await harness.fragmentManager.createFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, {
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "theme cue",
      body: "theme body",
      parent: fragmentParent(domain.id),
    });
    expect(harness.fragmentManager.getScopedFragmentIds(AGENT_ID_A)).toContain(themeNode.id);

    await expectAppErrorCode(
      harness.fragmentManager.createFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, {
        kind: FRAGMENT_KIND.DOMAIN,
        cue: "anchor cue",
        body: "anchor body",
        parent: agentParent(AGENT_ID_A),
      }),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("lets the reflection agent prune a target's sole-reached leaf", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    await harness.fragmentManager.deleteFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, lesson.id);

    await expectAppErrorCode(harness.fragmentManager.readFragment(lesson.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  });

  it("still rejects curator deletes of shared nodes and fragments with children", async () => {
    const harness = await createHarness();
    const sharedLesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, sharedLesson.id);
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(
      harness.fragmentManager.deleteFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, sharedLesson.id),
      APP_ERROR_CODES.VALIDATION
    );
    await expectAppErrorCode(
      harness.fragmentManager.deleteFragmentForAgent(FRAGMENT_REFLECTION_AGENT_ID, domain.id),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("still rejects a curator re-link that would create a cycle", async () => {
    const harness = await createHarness();
    const parent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(parent.id));

    await expectAppErrorCode(
      harness.fragmentManager.relinkFragment(FRAGMENT_REFLECTION_AGENT_ID, parent.id, fragmentParent(child.id)),
      APP_ERROR_CODES.VALIDATION
    );
  });
});

describe("FragmentManager.deleteFragment", () => {
  it("cascades the fragment's remaining edges", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, knowledge.id);

    await harness.fragmentManager.deleteFragment(knowledge.id);

    expect(
      harness.relationshipManager
        .getAllRelationships()
        .filter(
          (relationship) => relationship.sourceEntityId === knowledge.id || relationship.targetEntityId === knowledge.id
        )
    ).toHaveLength(0);
  });
});
