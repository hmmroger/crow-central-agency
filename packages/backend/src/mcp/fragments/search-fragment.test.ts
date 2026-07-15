import { describe, expect, it } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { ENTITY_TYPE, FRAGMENT_KIND } from "@crow-central-agency/shared";
import { getSearchFragmentToolConfig } from "./search-fragment.js";
import { FragmentManager } from "../../services/fragment/fragment-manager.js";
import type { FragmentParent } from "../../services/fragment/fragment-manager.types.js";
import { RelationshipManager } from "../../services/relationship-manager.js";
import { AgentCircleManager } from "../../services/agent-circle-manager.js";
import { AgentRegistry } from "../../services/agent-registry.js";
import { AgentTaskManager } from "../../services/agent-task-manager.js";
import { ArtifactManager } from "../../services/artifact/artifact-manager.js";
import { WsBroadcaster } from "../../services/ws-broadcaster.js";
import { DocumentSearchService } from "../../services/search/document-search-service.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";

const AGENT_ID_A = "11111111-1111-4111-8111-111111111111";
const AGENT_ID_B = "22222222-2222-4222-8222-222222222222";

interface Harness {
  fragmentManager: FragmentManager;
  documentSearchService: DocumentSearchService;
}

async function createHarness(): Promise<Harness> {
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(new InMemoryObjectStore());
  const circleManager = new AgentCircleManager(new InMemoryObjectStore(), relationshipManager, broadcaster);
  const registry = new AgentRegistry(new InMemoryObjectStore(), new InMemoryObjectStore(), broadcaster, circleManager);
  const taskManager = new AgentTaskManager(new InMemoryObjectStore(), broadcaster, circleManager);
  const artifactManager = new ArtifactManager(new InMemoryObjectStore(), registry, circleManager);
  const fragmentManager = new FragmentManager(
    new InMemoryObjectStore(),
    new InMemoryObjectStore(),
    relationshipManager
  );
  const documentSearchService = new DocumentSearchService(
    artifactManager,
    taskManager,
    registry,
    circleManager,
    fragmentManager
  );
  await relationshipManager.initialize();
  await fragmentManager.initialize();

  return { fragmentManager, documentSearchService };
}

function agentParent(agentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.AGENT, entityId: agentId };
}

function fragmentParent(fragmentId: string): FragmentParent {
  return { entityType: ENTITY_TYPE.FRAGMENT, entityId: fragmentId };
}

function getResultText(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" && typeof first.text === "string" ? first.text : "";
}

describe("search_fragment", () => {
  it("returns hits inside the target agent's scope and excludes hits outside it", async () => {
    const harness = await createHarness();
    const domainA = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Alpha kubernetes pipeline",
      body: "Deployment pipeline knowledge for the alpha project.",
      parent: agentParent(AGENT_ID_A),
    });
    const domainB = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Beta kubernetes maintenance",
      body: "Cluster maintenance knowledge for the beta project.",
      parent: agentParent(AGENT_ID_B),
    });

    // Initialize after the writes: startup indexing is synchronous, event delivery is setImmediate-deferred
    await harness.documentSearchService.initialize();
    const { handler } = getSearchFragmentToolConfig(harness.fragmentManager, harness.documentSearchService);
    const result = await handler({ targetAgentId: AGENT_ID_A, query: "kubernetes" }, undefined);

    const text = getResultText(result);
    expect(text).toContain(domainA.id);
    expect(text).toContain("(DOMAIN)");
    expect(text).toContain("Alpha kubernetes pipeline");
    expect(text).toContain("[Read with read_fragment]");
    expect(text).not.toContain(domainB.id);
  });

  it("includes fragments reachable through links, not just direct associations", async () => {
    const harness = await createHarness();
    const domain = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Alpha project",
      body: "Top-level domain for the alpha project.",
      parent: agentParent(AGENT_ID_A),
    });
    const knowledge = await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.KNOWLEDGE,
      cue: "Grafana dashboard location",
      body: "The grafana dashboards live under the observability folder.",
      parent: fragmentParent(domain.id),
    });

    // Initialize after the writes: startup indexing is synchronous, event delivery is setImmediate-deferred
    await harness.documentSearchService.initialize();
    const { handler } = getSearchFragmentToolConfig(harness.fragmentManager, harness.documentSearchService);
    const result = await handler({ targetAgentId: AGENT_ID_A, query: "grafana" }, undefined);

    expect(getResultText(result)).toContain(knowledge.id);
  });

  it("reports when nothing in the target's scope matches", async () => {
    const harness = await createHarness();
    await harness.fragmentManager.createFragment({
      kind: FRAGMENT_KIND.DOMAIN,
      cue: "Beta kubernetes maintenance",
      body: "Cluster maintenance knowledge for the beta project.",
      parent: agentParent(AGENT_ID_B),
    });

    // Initialize after the writes: startup indexing is synchronous, event delivery is setImmediate-deferred
    await harness.documentSearchService.initialize();
    const { handler } = getSearchFragmentToolConfig(harness.fragmentManager, harness.documentSearchService);
    const result = await handler({ targetAgentId: AGENT_ID_A, query: "kubernetes" }, undefined);

    expect(getResultText(result)).toContain("No fragment matches found");
  });
});
