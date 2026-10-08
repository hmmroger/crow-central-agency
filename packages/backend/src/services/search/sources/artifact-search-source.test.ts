import { describe, expect, it, vi } from "vitest";
import {
  AGENT_TASK_SOURCE_TYPE,
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_TYPE,
  ENTITY_TYPE,
  type ArtifactMetadata,
} from "@crow-central-agency/shared";
import { ArtifactSearchSource } from "./artifact-search-source.js";
import { ArtifactManager } from "../../artifact/artifact-manager.js";
import { AgentRegistry } from "../../agent-registry.js";
import { AgentCircleManager } from "../../agent-circle-manager.js";
import { RelationshipManager } from "../../relationship-manager.js";
import { FragmentManager } from "../../fragment/fragment-manager.js";
import { WsBroadcaster } from "../../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../../core/store/in-memory-object-store.mock.js";
import { DATA_SOURCE_TYPE } from "../document-search-service.types.js";
import type { ReadArtifactResult } from "../../artifact/artifact-manager.types.js";

vi.mock("../../artifact/artifact-manager.js");
vi.mock("../../agent-registry.js");
vi.mock("../../agent-circle-manager.js");
vi.mock("../../relationship-manager.js");
vi.mock("../../fragment/fragment-manager.js");
vi.mock("../../ws-broadcaster.js");

const AGENT_ARTIFACT: ArtifactMetadata = {
  id: "artifact-1",
  filename: "plan.md",
  type: ARTIFACT_TYPE.STANDARD,
  contentType: ARTIFACT_CONTENT_TYPE.TEXT,
  entityId: "agent-1",
  entityType: ENTITY_TYPE.AGENT,
  size: 4,
  createdTimestamp: 0,
  updatedTimestamp: 0,
  createdBy: { sourceType: AGENT_TASK_SOURCE_TYPE.USER },
};

const CIRCLE_ARTIFACT: ArtifactMetadata = {
  ...AGENT_ARTIFACT,
  id: "artifact-2",
  entityId: "circle-1",
  entityType: ENTITY_TYPE.AGENT_CIRCLE,
};

interface Harness {
  artifactManager: ArtifactManager;
  source: ArtifactSearchSource;
  /** Resolves the reads in the order they started, each with its own content */
  pendingReads: Array<() => void>;
}

function createHarness(): Harness {
  const store = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store);
  const circleManager = new AgentCircleManager(store, relationshipManager, broadcaster);
  const fragmentManager = new FragmentManager(store, store, relationshipManager, broadcaster);
  const registry = new AgentRegistry(store, store, broadcaster, circleManager, fragmentManager);
  const artifactManager = new ArtifactManager(store, registry, circleManager);
  const pendingReads: Array<() => void> = [];
  const deferRead = (metadata: ArtifactMetadata) =>
    new Promise<ReadArtifactResult>((resolve) => {
      const content = `read ${pendingReads.length + 1}`;
      pendingReads.push(() => resolve({ metadata, content }));
    });
  vi.mocked(artifactManager.readArtifact).mockImplementation(() => deferRead(AGENT_ARTIFACT));
  vi.mocked(artifactManager.readCircleArtifact).mockImplementation(() => deferRead(CIRCLE_ARTIFACT));

  return { artifactManager, source: new ArtifactSearchSource(artifactManager, registry, circleManager), pendingReads };
}

function subscribe(harness: Harness) {
  const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
  harness.source.subscribe(listener);
  return { listener, handlers: new Map(vi.mocked(harness.artifactManager.on).mock.calls) };
}

function toRef(metadata: ArtifactMetadata) {
  return {
    documentId: metadata.filename,
    dataSourceType:
      metadata.entityType === ENTITY_TYPE.AGENT_CIRCLE ? DATA_SOURCE_TYPE.CIRCLE_ARTIFACT : DATA_SOURCE_TYPE.ARTIFACT,
    provenanceId: metadata.entityId,
  };
}

function flushListeners(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("ArtifactSearchSource.subscribe", () => {
  it("drops a read that a later save of the same artifact overtook", async () => {
    const harness = createHarness();
    const { listener, handlers } = subscribe(harness);

    handlers.get("artifactSaved")?.({ metadata: AGENT_ARTIFACT });
    handlers.get("artifactSaved")?.({ metadata: AGENT_ARTIFACT });
    await flushListeners();
    const [firstRead, secondRead] = harness.pendingReads;
    secondRead();
    await flushListeners();
    firstRead();
    await flushListeners();

    expect(listener.onDocumentUpdate).toHaveBeenCalledTimes(1);
    expect(listener.onDocumentUpdate).toHaveBeenCalledWith({
      ...toRef(AGENT_ARTIFACT),
      title: "plan.md",
      text: "read 2",
      tags: undefined,
    });
  });

  it("drops a read still in flight when the artifact is deleted", async () => {
    const harness = createHarness();
    const { listener, handlers } = subscribe(harness);

    handlers.get("artifactSaved")?.({ metadata: AGENT_ARTIFACT });
    handlers.get("artifactDeleted")?.({ metadata: AGENT_ARTIFACT });
    await flushListeners();
    harness.pendingReads[0]();
    await flushListeners();

    expect(listener.onDocumentRemove).toHaveBeenCalledWith(toRef(AGENT_ARTIFACT));
    expect(listener.onDocumentUpdate).not.toHaveBeenCalled();
  });

  it("drops a read still in flight when the artifact is saved as non-text", async () => {
    const harness = createHarness();
    const { listener, handlers } = subscribe(harness);

    handlers.get("artifactSaved")?.({ metadata: AGENT_ARTIFACT });
    handlers.get("artifactSaved")?.({ metadata: { ...AGENT_ARTIFACT, contentType: ARTIFACT_CONTENT_TYPE.IMAGE } });
    await flushListeners();
    harness.pendingReads[0]();
    await flushListeners();

    expect(harness.pendingReads).toHaveLength(1);
    expect(listener.onDocumentRemove).toHaveBeenCalledWith(toRef(AGENT_ARTIFACT));
    expect(listener.onDocumentUpdate).not.toHaveBeenCalled();
  });

  it("keeps overlapping reads of same-named artifacts in different containers", async () => {
    const harness = createHarness();
    const { listener, handlers } = subscribe(harness);

    handlers.get("artifactSaved")?.({ metadata: AGENT_ARTIFACT });
    handlers.get("artifactSaved")?.({ metadata: CIRCLE_ARTIFACT });
    await flushListeners();
    for (const resolveRead of harness.pendingReads) {
      resolveRead();
    }

    await flushListeners();

    expect(listener.onDocumentUpdate).toHaveBeenCalledTimes(2);
    expect(listener.onDocumentUpdate).toHaveBeenCalledWith(expect.objectContaining(toRef(AGENT_ARTIFACT)));
    expect(listener.onDocumentUpdate).toHaveBeenCalledWith(expect.objectContaining(toRef(CIRCLE_ARTIFACT)));
  });
});
