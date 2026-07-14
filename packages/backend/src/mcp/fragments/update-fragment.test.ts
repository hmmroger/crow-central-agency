import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  FRAGMENT_REFLECTION_AGENT_ID,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
} from "@crow-central-agency/shared";
import { changeFragmentParent } from "./update-fragment.js";
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

describe("changeFragmentParent", () => {
  it("moves a fragment from its agent anchor to a fragment parent", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await changeFragmentParent(harness.fragmentManager, AGENT_ID_A, feedback.id, fragmentParent(domain.id));

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

  it("replaces the incoming link but leaves other agents' associations untouched", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(domainA.id));
    await harness.fragmentManager.createAssociation(AGENT_ID_B, feedback.id);
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_B));

    await changeFragmentParent(harness.fragmentManager, AGENT_ID_B, feedback.id, fragmentParent(domainB.id));

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
    expect(harness.fragmentManager.getAgentsReachingFragment(feedback.id)).toEqual([AGENT_ID_B]);
  });

  it("rejects a move that would create a cycle and restores the original edges", async () => {
    const harness = await createHarness();
    const parent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const child = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(parent.id));

    await expectAppErrorCode(
      changeFragmentParent(harness.fragmentManager, AGENT_ID_A, parent.id, fragmentParent(child.id)),
      APP_ERROR_CODES.VALIDATION
    );

    const originalLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: parent.id,
      targetEntityId: child.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    const restoredAnchors = harness.relationshipManager.queryRelationships({
      sourceEntityId: AGENT_ID_A,
      targetEntityId: parent.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    expect(originalLinks).toHaveLength(1);
    expect(restoredAnchors).toHaveLength(1);
  });

  it("moves a KNOWLEDGE fragment to another DOMAIN but rejects an agent anchor", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));

    await changeFragmentParent(harness.fragmentManager, AGENT_ID_A, knowledge.id, fragmentParent(domainB.id));

    const parentLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(parentLinks).toHaveLength(1);
    expect(parentLinks[0].sourceEntityId).toBe(domainB.id);

    await expectAppErrorCode(
      changeFragmentParent(harness.fragmentManager, AGENT_ID_A, knowledge.id, agentParent(AGENT_ID_A)),
      APP_ERROR_CODES.VALIDATION
    );
    // The rejected anchor restored the fragment under its current DOMAIN
    const restoredLinks = harness.relationshipManager.queryRelationships({
      sourceEntityId: domainB.id,
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(restoredLinks).toHaveLength(1);
  });

  it("rejects a move with a stale expectedUpdatedTimestamp", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));
    const updated = await harness.fragmentManager.updateFragment(feedback.id, { cue: "changed" });

    await expectAppErrorCode(
      changeFragmentParent(
        harness.fragmentManager,
        AGENT_ID_A,
        feedback.id,
        fragmentParent(domain.id),
        updated.updatedTimestamp - 1
      ),
      APP_ERROR_CODES.CONFLICT
    );
  });

  it("reports FRAGMENT_NOT_FOUND for an out-of-scope new parent", async () => {
    const harness = await createHarness();
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_B));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      changeFragmentParent(harness.fragmentManager, AGENT_ID_A, feedback.id, fragmentParent(domainB.id)),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
  });

  it("as the curator, leaves the target's association anchor untouched", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, agentParent(AGENT_ID_A));

    await changeFragmentParent(
      harness.fragmentManager,
      FRAGMENT_REFLECTION_AGENT_ID,
      feedback.id,
      fragmentParent(domain.id)
    );

    const associations = harness.relationshipManager.queryRelationships({
      targetEntityId: feedback.id,
      relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
    });
    expect(associations).toHaveLength(1);
    expect(associations[0].sourceEntityId).toBe(AGENT_ID_A);
  });
});
