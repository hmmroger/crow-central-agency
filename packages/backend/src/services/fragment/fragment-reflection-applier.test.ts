import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  FRAGMENT_KIND,
  REFLECTION_NODE_REF,
  REFLECTION_OP,
  RELATIONSHIP_TYPE,
  type Fragment,
  type FragmentKind,
  type ReflectionNodeRef,
} from "@crow-central-agency/shared";
import { applyReflectionPlan } from "./fragment-reflection-applier.js";
import { FragmentManager } from "./fragment-manager.js";
import type { FragmentParent } from "./fragment-manager.types.js";
import { RelationshipManager } from "../relationship-manager.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";

const TARGET_AGENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_AGENT_ID = "22222222-2222-4222-8222-222222222222";

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

function agentRef(): ReflectionNodeRef {
  return { ref: REFLECTION_NODE_REF.AGENT };
}

function fragmentRef(fragmentId: string): ReflectionNodeRef {
  return { ref: REFLECTION_NODE_REF.FRAGMENT, id: fragmentId };
}

function tempRef(tempId: string): ReflectionNodeRef {
  return { ref: REFLECTION_NODE_REF.TEMP, tempId };
}

async function createFragment(harness: Harness, kind: FragmentKind, parent: FragmentParent): Promise<Fragment> {
  return harness.fragmentManager.createFragment({ kind, cue: `${kind} cue`, body: `${kind} body`, parent });
}

function queryLinks(harness: Harness, parentFragmentId: string, childFragmentId: string) {
  return harness.relationshipManager.queryRelationships({
    sourceEntityId: parentFragmentId,
    targetEntityId: childFragmentId,
    relationshipType: RELATIONSHIP_TYPE.LINK,
  });
}

function queryAssociations(harness: Harness, agentId: string, fragmentId: string) {
  return harness.relationshipManager.queryRelationships({
    sourceEntityId: agentId,
    targetEntityId: fragmentId,
    relationshipType: RELATIONSHIP_TYPE.ASSOCIATION,
  });
}

describe("applyReflectionPlan", () => {
  it("applies a create+link plan, resolving temp ids to the nodes earlier creates produced", async () => {
    const harness = await createHarness();
    const lesson = await createFragment(harness, FRAGMENT_KIND.LESSON, agentParent(TARGET_AGENT_ID));

    const result = await applyReflectionPlan(harness.fragmentManager, TARGET_AGENT_ID, {
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          tempId: "theme",
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Build tooling",
          body: "Sub-domain grouping build and lint lessons.",
          source: agentRef(),
        },
        {
          op: REFLECTION_OP.CREATE,
          tempId: "fact",
          kind: FRAGMENT_KIND.KNOWLEDGE,
          cue: "Lint runs separately",
          body: "The scoped build script does not run lint.",
          source: tempRef("theme"),
        },
        { op: REFLECTION_OP.LINK, fragment: fragmentRef(lesson.id), target: tempRef("theme"), original: agentRef() },
      ],
    });

    expect(result.failures).toEqual([]);
    const scopedFragmentIds = harness.fragmentManager.getScopedFragmentIds(TARGET_AGENT_ID);
    const firstLevel = await harness.fragmentManager.getFirstLevelFragmentCues(TARGET_AGENT_ID);
    expect(firstLevel.map((cueEntry) => cueEntry.cue)).toEqual(["Build tooling"]);

    const theme = firstLevel[0];
    const themeChildren = await harness.fragmentManager.getChildFragmentCues(theme.id);
    expect(themeChildren.map((cueEntry) => cueEntry.cue).sort()).toEqual(
      ["Lint runs separately", `${FRAGMENT_KIND.LESSON} cue`].sort()
    );
    // the moved lesson lost its agent anchor but stays reachable through the theme
    expect(queryAssociations(harness, TARGET_AGENT_ID, lesson.id)).toHaveLength(0);
    expect(scopedFragmentIds.has(lesson.id)).toBe(true);
  });

  it("resolves an agent NodeRef to the target agent being reorganized", async () => {
    const harness = await createHarness();

    const result = await applyReflectionPlan(harness.fragmentManager, OTHER_AGENT_ID, {
      operations: [
        {
          op: REFLECTION_OP.CREATE,
          tempId: "domain",
          kind: FRAGMENT_KIND.DOMAIN,
          cue: "Anchored domain",
          body: "Anchored to the target agent.",
          source: agentRef(),
        },
      ],
    });

    expect(result.failures).toEqual([]);
    const targetFirstLevel = await harness.fragmentManager.getFirstLevelFragmentCues(OTHER_AGENT_ID);
    expect(targetFirstLevel.map((cueEntry) => cueEntry.cue)).toEqual(["Anchored domain"]);
    expect(await harness.fragmentManager.getFirstLevelFragmentCues(TARGET_AGENT_ID)).toEqual([]);
  });

  it("rolls a move's added edge back when the original edge removal fails", async () => {
    const harness = await createHarness();
    const currentDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(TARGET_AGENT_ID));
    const newDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(TARGET_AGENT_ID));
    const notAParent = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(TARGET_AGENT_ID));
    const feedback = await createFragment(harness, FRAGMENT_KIND.FEEDBACK, fragmentParent(currentDomain.id));

    const result = await applyReflectionPlan(harness.fragmentManager, TARGET_AGENT_ID, {
      operations: [
        {
          op: REFLECTION_OP.LINK,
          fragment: fragmentRef(feedback.id),
          target: fragmentRef(newDomain.id),
          original: fragmentRef(notAParent.id),
        },
      ],
    });

    expect(result.failures).toHaveLength(1);
    expect(queryLinks(harness, newDomain.id, feedback.id)).toHaveLength(0);
    expect(queryLinks(harness, currentDomain.id, feedback.id)).toHaveLength(1);
  });

  it("returns the ids an orphaning unlink cascade-collected", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(TARGET_AGENT_ID));
    const knowledge = await createFragment(harness, FRAGMENT_KIND.KNOWLEDGE, fragmentParent(domain.id));

    const result = await applyReflectionPlan(harness.fragmentManager, TARGET_AGENT_ID, {
      operations: [{ op: REFLECTION_OP.UNLINK, fragment: fragmentRef(domain.id), source: agentRef() }],
    });

    expect(result.failures).toEqual([]);
    expect(result.collectedIds).toEqual([domain.id, knowledge.id]);
    expect(await harness.fragmentManager.getFragmentCue(domain.id)).toBeUndefined();
    expect(await harness.fragmentManager.getFragmentCue(knowledge.id)).toBeUndefined();
  });

  it("collects failing ops without aborting the remaining ones", async () => {
    const harness = await createHarness();
    const domain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, agentParent(TARGET_AGENT_ID));
    const subDomain = await createFragment(harness, FRAGMENT_KIND.DOMAIN, fragmentParent(domain.id));

    const result = await applyReflectionPlan(harness.fragmentManager, TARGET_AGENT_ID, {
      operations: [
        // KNOWLEDGE cannot anchor to an agent — the create fails
        {
          op: REFLECTION_OP.CREATE,
          tempId: "orphan-fact",
          kind: FRAGMENT_KIND.KNOWLEDGE,
          cue: "Misparented fact",
          body: "Never created.",
          source: agentRef(),
        },
        // its tempId therefore never resolved, so the dependent link fails too
        { op: REFLECTION_OP.LINK, fragment: tempRef("orphan-fact"), target: fragmentRef(domain.id) },
        // linking the ancestor under its descendant closes a cycle
        { op: REFLECTION_OP.LINK, fragment: fragmentRef(domain.id), target: fragmentRef(subDomain.id) },
        // the agent is never a valid fragment operand
        { op: REFLECTION_OP.UPDATE, fragment: agentRef(), cue: "Rewritten" },
        // a later valid op still applies
        { op: REFLECTION_OP.UPDATE, fragment: fragmentRef(subDomain.id), cue: "Sharper sub-domain cue" },
      ],
    });

    expect(result.failures).toHaveLength(4);
    expect(result.failures.map((failure) => failure.error)).toEqual([
      expect.stringContaining("cannot be associated directly to an agent"),
      expect.stringContaining('Unresolved temp id "orphan-fact"'),
      expect.stringContaining("would create a cycle"),
      expect.stringContaining("cannot be the fragment operand"),
    ]);
    const updated = await harness.fragmentManager.readFragment(subDomain.id);
    expect(updated.cue).toBe("Sharper sub-domain cue");
    expect(queryLinks(harness, subDomain.id, domain.id)).toHaveLength(0);
  });
});
