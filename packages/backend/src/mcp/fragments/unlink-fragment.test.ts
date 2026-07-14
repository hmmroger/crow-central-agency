import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
} from "@crow-central-agency/shared";
import { unlinkFragmentEdge, type ActiveDomainManager } from "./unlink-fragment.js";
import { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { FragmentParent } from "../../services/fragment/fragment-manager.types.js";
import { RelationshipManager } from "../../services/relationship-manager.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_FRAGMENT_ID = "99999999-9999-4999-8999-999999999999";

class FakeActiveDomainManager implements ActiveDomainManager {
  public cleared: Array<{ agentId: string; fragmentId: string }> = [];

  public async clearActiveDomain(agentId: string, deletedFragmentId: string): Promise<void> {
    this.cleared.push({ agentId, fragmentId: deletedFragmentId });
  }
}

interface Harness {
  relationshipManager: RelationshipManager;
  fragmentManager: FragmentManager;
  runtimeManager: FakeActiveDomainManager;
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

  return { relationshipManager, fragmentManager, runtimeManager: new FakeActiveDomainManager() };
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

describe("unlinkFragmentEdge", () => {
  it("removes the named edge and leaves a still-reachable fragment alive", async () => {
    const harness = await createHarness();
    const domainA = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const domainB = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domainA.id));
    await harness.fragmentManager.createLink(domainB.id, knowledge.id);

    const collectedIds = await unlinkFragmentEdge(
      harness.fragmentManager,
      harness.runtimeManager,
      AGENT_ID_A,
      knowledge.id,
      domainA.id
    );

    expect(collectedIds).toEqual([]);
    expect(harness.runtimeManager.cleared).toEqual([]);
    const remainingLinks = harness.relationshipManager.queryRelationships({
      targetEntityId: knowledge.id,
      relationshipType: RELATIONSHIP_TYPE.LINK,
    });
    expect(remainingLinks.map((link) => link.sourceEntityId)).toEqual([domainB.id]);
    expect((await harness.fragmentManager.readFragment(knowledge.id)).id).toBe(knowledge.id);
  });

  it("cascades a last-edge removal and clears collected ids from the acting agent's active set", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(AGENT_ID_A));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(subDomain.id));

    const collectedIds = await unlinkFragmentEdge(
      harness.fragmentManager,
      harness.runtimeManager,
      AGENT_ID_A,
      domain.id,
      AGENT_ID_A
    );

    expect(collectedIds.sort()).toEqual([domain.id, subDomain.id, knowledge.id].sort());
    expect(harness.runtimeManager.cleared.map((entry) => entry.fragmentId).sort()).toEqual(
      [domain.id, subDomain.id, knowledge.id].sort()
    );
    expect(harness.runtimeManager.cleared.every((entry) => entry.agentId === AGENT_ID_A)).toBe(true);
    await expectAppErrorCode(harness.fragmentManager.readFragment(knowledge.id), APP_ERROR_CODES.FRAGMENT_NOT_FOUND);
  });

  it("reports FRAGMENT_NOT_FOUND for a fragment outside the acting agent's scope", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_B));

    await expectAppErrorCode(
      unlinkFragmentEdge(harness.fragmentManager, harness.runtimeManager, AGENT_ID_A, lesson.id, AGENT_ID_B),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
  });

  it("reports FRAGMENT_NOT_FOUND for an inaccessible fragment source", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(AGENT_ID_A));

    await expectAppErrorCode(
      unlinkFragmentEdge(harness.fragmentManager, harness.runtimeManager, AGENT_ID_A, lesson.id, UNKNOWN_FRAGMENT_ID),
      APP_ERROR_CODES.FRAGMENT_NOT_FOUND
    );
  });
});
