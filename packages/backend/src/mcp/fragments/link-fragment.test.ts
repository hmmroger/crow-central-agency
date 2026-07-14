import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
} from "@crow-central-agency/shared";
import { linkFragment } from "./link-fragment.js";
import { toFragmentParent } from "./write-fragment.js";
import { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { FragmentParent } from "../../services/fragment/fragment-manager.types.js";
import { RelationshipManager } from "../../services/relationship-manager.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";

interface Harness {
  relationshipManager: RelationshipManager;
  fragmentManager: FragmentManager;
}

async function createHarness(): Promise<Harness> {
  const relationshipManager = new RelationshipManager(new InMemoryObjectStore());
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager
  );
  await relationshipManager.initialize();
  await fragmentManager.initialize();

  return { relationshipManager, fragmentManager };
}

function agentParent(agentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
}

function fragmentParent(fragmentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: fragmentId };
}

async function createFragment(harness: Harness, kind: FragmentKind, parent: FragmentParent): Promise<Fragment> {
  return harness.fragmentManager.createFragment({ kind, cue: `${kind} cue`, body: `${kind} body`, parent });
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

describe("toFragmentParent", () => {
  it("maps the acting agent's own id to an agent anchor and any other id to a fragment parent", () => {
    expect(toFragmentParent(AGENT_ID_A, AGENT_ID_A)).toEqual(agentParent(AGENT_ID_A));
    // Another agent's id is indistinguishable from a fragment id, so anchoring
    // to another agent is unexpressible: it fails the accessibility check instead
    expect(toFragmentParent(AGENT_ID_A, AGENT_ID_B)).toEqual(fragmentParent(AGENT_ID_B));
  });
});

describe("linkFragment", () => {
  it("adds a second parent when no original is given, leaving existing edges untouched", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await linkFragment(harness.fragmentManager, AGENT_ID_A, knowledge.id, domainB.id);

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks.map((link) => link.sourceEntityId).sort()).toEqual([domainA.id, domainB.id].sort());
  });

  it("moves a fragment from its agent anchor to a fragment parent atomically", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await linkFragment(harness.fragmentManager, AGENT_ID_A, feedback.id, domain.id, AGENT_ID_A);

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
    expect(harness.fragmentManager.isFragmentAccessible(AGENT_ID_A, feedback.id)).toBe(true);
  });

  it("a move removes only the named original edge, preserving other agents' associations", async () => {
    const harness = await createHarness();
    const oldDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const newDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(oldDomain.id));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, feedback.id);

    await linkFragment(harness.fragmentManager, AGENT_ID_A, feedback.id, newDomain.id, oldDomain.id);

    const oldLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: oldDomain.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const newLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: newDomain.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const associations = harness.relationshipManager.queryRelationships({
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    expect(oldLinks).toHaveLength(0);
    expect(newLinks).toHaveLength(1);
    // B's sharing association was NOT consumed by the move — only the named edge went away
    expect(associations.map((association) => association.sourceEntityId)).toEqual([AGENT_ID_B]);
  });

  it("rolls back the added edge when the named original edge does not exist", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    // accessible to A but NOT a current parent of feedback
    const domainC = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domainA.id));

    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_A, feedback.id, domainB.id, domainC.id),
      APP_ERROR_CODES.RELATIONSHIP_NOT_FOUND
    );

    const rolledBackLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainB.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const survivingLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainA.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(rolledBackLinks).toHaveLength(0);
    expect(survivingLinks).toHaveLength(1);
  });

  it("rejects an original edge the caller cannot access", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domainA.id));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, feedback.id);
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_B));

    // B can reach the fragment through its association but not A's parent domain,
    // so B may add its own parent yet cannot consume A's edge as the original
    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_B, feedback.id, domainB.id, domainA.id),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );

    const originalLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainA.id,
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(originalLinks).toHaveLength(1);
  });

  it("rejects another agent's id as target — self-anchor only", async () => {
    const harness = await createHarness();
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    // AGENT_ID_B maps to a fragment parent and fails accessibility as an unknown fragment
    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_A, feedback.id, AGENT_ID_B),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
  });

  it("rejects a move that would create a cycle and leaves the graph untouched", async () => {
    const harness = await createHarness();
    const parent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(parent.id));

    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_A, parent.id, child.id, AGENT_ID_A),
      APP_ERROR_CODES.VALIDATION
    );

    const originalLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: parent.id,
      targetEntityId: child.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const anchors = harness.relationshipManager.queryRelationships({
      sourceEntityId: AGENT_ID_A,
      targetEntityId: parent.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    const rejectedLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: child.id,
      targetEntityId: parent.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(originalLinks).toHaveLength(1);
    expect(anchors).toHaveLength(1);
    expect(rejectedLinks).toHaveLength(0);
  });

  it("rejects a kind-matrix violation", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_A, knowledge.id, feedback.id),
      APP_ERROR_CODES.VALIDATION
    );
  });

  it("rejects re-anchoring a KNOWLEDGE fragment to the agent and keeps the original link", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    await expectAppErrorCode(
      linkFragment(harness.fragmentManager, AGENT_ID_A, knowledge.id, AGENT_ID_A, domain.id),
      APP_ERROR_CODES.VALIDATION
    );

    const originalLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domain.id,
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(originalLinks).toHaveLength(1);
  });
});
