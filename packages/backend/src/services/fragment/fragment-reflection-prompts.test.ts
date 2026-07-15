import { describe, expect, it } from "vitest";
import { ENTITY_TYPE, FRAGMENT_KIND, REFLECTION_AGENT_REF, REFLECTION_TEMP_PREFIX } from "@crow-central-agency/shared";
import { CROW_FRAGMENT_REFLECTION_AGENT_PERSONA, composeReflectionContext } from "./fragment-reflection-prompts.js";
import { FRAGMENT_REFLECTION_BEGIN, FRAGMENT_REFLECTION_END } from "./fragment-reflection.constants.js";
import { FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";
import { RelationshipManager } from "../relationship-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";

const TARGET_AGENT_ID = "11111111-1111-4111-8111-111111111111";

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

function agentParent(agentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
}

function fragmentParent(fragmentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: fragmentId };
}

describe("composeReflectionContext", () => {
  it("renders each focus fragment's content, placement, and the target's first-level map", async () => {
    const fragmentManager = await createFragmentManager();
    const domain = await fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Alpha project",
      body: "Top-level domain for the alpha project.",
      parent: agentParent(TARGET_AGENT_ID),
    });
    const subDomain = await fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Observability",
      body: "Alpha observability sub-domain.",
      parent: fragmentParent(domain.id),
    });
    const focusKnowledge = await fragmentManager.createFragment({
      kind: FRAGMENT_KIND.KNOWLEDGE,
      cue: "Grafana dashboard location",
      body: "The grafana dashboards live under the observability folder.",
      parent: fragmentParent(subDomain.id),
    });
    const siblingKnowledge = await fragmentManager.createFragment({
      kind: FRAGMENT_KIND.KNOWLEDGE,
      cue: "Alert routing",
      body: "Alerts route through the on-call webhook.",
      parent: fragmentParent(subDomain.id),
    });
    const focusFeedback = await fragmentManager.createFragment({
      kind: FRAGMENT_KIND.FEEDBACK,
      cue: "Prefers small commits",
      body: "Keep changes small and modular.",
      parent: agentParent(TARGET_AGENT_ID),
    });

    const context = await composeReflectionContext(fragmentManager, TARGET_AGENT_ID, [focusKnowledge, focusFeedback]);

    expect(context).toContain(`Reflect on the fragment vault of target agent ${TARGET_AGENT_ID}.`);
    expect(context).toContain(`### [${focusKnowledge.id}] (${FRAGMENT_KIND.KNOWLEDGE}) Grafana dashboard location`);
    expect(context).toContain(`Body: ${focusKnowledge.body}`);
    expect(context).toContain(`Parents: [${subDomain.id}] (${FRAGMENT_KIND.DOMAIN}) Observability`);
    expect(context).toContain(`Ancestors: [${domain.id}] (${FRAGMENT_KIND.DOMAIN}) Alpha project`);
    expect(context).toContain(`Siblings: [${siblingKnowledge.id}] (${FRAGMENT_KIND.KNOWLEDGE}) Alert routing`);
    expect(context).toContain("Parents: the target agent (top-level anchor)");
    expect(context).toContain("## Target's first-level map");
    expect(context).toContain(`- [${domain.id}] (${FRAGMENT_KIND.DOMAIN}) Alpha project`);
    expect(context).toContain(`- [${focusFeedback.id}] (${FRAGMENT_KIND.FEEDBACK}) Prefers small commits`);
    // the sub-domain is not first-level and must not appear in the map section
    expect(context).not.toContain(`- [${subDomain.id}]`);
    expect(context).toContain("Return your reorganization plan as specified");
  });
});

describe("CROW_FRAGMENT_REFLECTION_AGENT_PERSONA", () => {
  it("retains the two substitution keys the agent config depends on", () => {
    expect(CROW_FRAGMENT_REFLECTION_AGENT_PERSONA.keys).toEqual(["maxWords", "firstLevelTarget"]);
  });

  it("teaches the flat string-ref output contract in the persona body", () => {
    const body = CROW_FRAGMENT_REFLECTION_AGENT_PERSONA.content.flatMap((section) => section.content).join("\n");

    expect(body).toContain(FRAGMENT_REFLECTION_BEGIN);
    expect(body).toContain(FRAGMENT_REFLECTION_END);
    expect(body).toContain(`"${REFLECTION_AGENT_REF}"`);
    expect(body).toContain(REFLECTION_TEMP_PREFIX);
    expect(body).toContain('"op": "create"');
    expect(body).toContain('"op": "link"');
    expect(body).toContain('"op": "unlink"');
    expect(body).toContain('"op": "update"');
    expect(body).toContain('"fragment"');
    expect(body).toContain('"parent"');
    expect(body).toContain('"from"');
    expect(body).toContain("{maxWords}");
    expect(body).toContain("{firstLevelTarget}");
  });
});
