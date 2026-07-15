import { describe, expect, it } from "vitest";
import { ENTITY_TYPE, FRAGMENT_KIND, type Fragment, type FragmentKind } from "@crow-central-agency/shared";
import { FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";
import { renderFragmentCues } from "./fragment-cue-renderer.js";
import { RelationshipManager } from "../relationship-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const STALE_FRAGMENT_ID = "33333333-3333-4333-8333-333333333333";

async function createFragmentManager(): Promise<FragmentManager> {
  const relationshipManager = new RelationshipManager(new InMemoryObjectStore());
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager,
    new WsBroadcaster()
  );
  await relationshipManager.initialize();
  await fragmentManager.initialize();

  return fragmentManager;
}

async function createFragment(
  fragmentManager: FragmentManager,
  kind: FragmentKind,
  cue: string,
  parent: FragmentParent
): Promise<Fragment> {
  return fragmentManager.createFragment({ kind, cue, body: `${cue} body`, parent });
}

function agentParent(agentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
}

function fragmentParent(fragmentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: fragmentId };
}

describe("renderFragmentCues", () => {
  it("returns undefined for an empty vault", async () => {
    const fragmentManager = await createFragmentManager();

    expect(await renderFragmentCues(AGENT_ID, [], fragmentManager)).toBeUndefined();
  });

  it("groups first-level association cues by kind and renders only non-empty sections", async () => {
    const fragmentManager = await createFragmentManager();
    const domain = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Project A", agentParent(AGENT_ID));
    const lesson = await createFragment(fragmentManager, FRAGMENT_KIND.LESSON, "Verify billing", agentParent(AGENT_ID));

    const block = await renderFragmentCues(AGENT_ID, [], fragmentManager);

    expect(block).toBe(
      [
        "### Fragment vault",
        "",
        "#### Domains",
        `- [${domain.id}] Project A`,
        "#### Lessons",
        `- [${lesson.id}] Verify billing`,
      ].join("\n")
    );
  });

  it("injects first-level cues only, not deeper fragments", async () => {
    const fragmentManager = await createFragmentManager();
    const domain = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Project A", agentParent(AGENT_ID));
    const nested = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.KNOWLEDGE,
      "Auth flow",
      fragmentParent(domain.id)
    );

    const block = await renderFragmentCues(AGENT_ID, [], fragmentManager);

    expect(block).toContain(`- [${domain.id}] Project A`);
    expect(block).not.toContain(nested.id);
  });

  it("renders the active-domain line and its direct children tagged with kind", async () => {
    const fragmentManager = await createFragmentManager();
    const domain = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Project A", agentParent(AGENT_ID));
    const knowledge = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.KNOWLEDGE,
      "Auth flow",
      fragmentParent(domain.id)
    );
    const subDomain = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.DOMAIN,
      "Auth service",
      fragmentParent(domain.id)
    );
    const grandChild = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.KNOWLEDGE,
      "Token refresh",
      fragmentParent(subDomain.id)
    );

    const block = await renderFragmentCues(AGENT_ID, [domain.id], fragmentManager);

    expect(block).toContain(`Active domains: Project A (${domain.id})`);
    expect(block).toContain(`#### Active domain — Project A`);
    expect(block).toContain(`- [${knowledge.id}] (${FRAGMENT_KIND.KNOWLEDGE}) Auth flow`);
    expect(block).toContain(`- [${subDomain.id}] (${FRAGMENT_KIND.DOMAIN}) Auth service`);
    expect(block).not.toContain(grandChild.id);
  });

  it("renders one child section per active domain", async () => {
    const fragmentManager = await createFragmentManager();
    const domainA = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Project A", agentParent(AGENT_ID));
    const domainB = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Platform", agentParent(AGENT_ID));
    const childA = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.KNOWLEDGE,
      "Auth flow",
      fragmentParent(domainA.id)
    );
    const childB = await createFragment(
      fragmentManager,
      FRAGMENT_KIND.KNOWLEDGE,
      "Logging conventions",
      fragmentParent(domainB.id)
    );

    const block = await renderFragmentCues(AGENT_ID, [domainA.id, domainB.id], fragmentManager);

    expect(block).toContain(`Active domains: Project A (${domainA.id}), Platform (${domainB.id})`);
    expect(block).toContain(`#### Active domain — Project A`);
    expect(block).toContain(`- [${childA.id}] (${FRAGMENT_KIND.KNOWLEDGE}) Auth flow`);
    expect(block).toContain(`#### Active domain — Platform`);
    expect(block).toContain(`- [${childB.id}] (${FRAGMENT_KIND.KNOWLEDGE}) Logging conventions`);
  });

  it("skips an active domain that is no longer in the index but keeps the rest", async () => {
    const fragmentManager = await createFragmentManager();
    await createFragment(fragmentManager, FRAGMENT_KIND.FEEDBACK, "Small commits", agentParent(AGENT_ID));
    const domain = await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Project A", agentParent(AGENT_ID));

    const block = await renderFragmentCues(AGENT_ID, [STALE_FRAGMENT_ID, domain.id], fragmentManager);

    expect(block).toContain("#### Feedback");
    expect(block).toContain(`Active domains: Project A (${domain.id})`);
    expect(block).not.toContain(STALE_FRAGMENT_ID);
  });

  it("omits the active-domain line when no active id resolves", async () => {
    const fragmentManager = await createFragmentManager();
    await createFragment(fragmentManager, FRAGMENT_KIND.FEEDBACK, "Small commits", agentParent(AGENT_ID));

    const block = await renderFragmentCues(AGENT_ID, [STALE_FRAGMENT_ID], fragmentManager);

    expect(block).toContain("#### Feedback");
    expect(block).not.toContain("Active domain");
  });

  it("does not surface another agent's fragments", async () => {
    const fragmentManager = await createFragmentManager();
    const otherAgentId = "22222222-2222-4222-8222-222222222222";
    await createFragment(fragmentManager, FRAGMENT_KIND.DOMAIN, "Other vault", agentParent(otherAgentId));

    expect(await renderFragmentCues(AGENT_ID, [], fragmentManager)).toBeUndefined();
  });
});
