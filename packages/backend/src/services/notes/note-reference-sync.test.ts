import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  RELATIONSHIP_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { NoteReferenceSync } from "./note-reference-sync.js";
import { WikilinkResolver } from "./wikilink-resolver.js";
import { RelationshipManager } from "../relationship-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";

const PROJECTS: NoteFolderMetadata = {
  id: "projects",
  entityType: ENTITY_TYPE.NOTE_FOLDER,
  name: "Projects",
  path: "Projects",
  updatedTimestamp: 0,
  isReadOnly: true,
  isTrashed: false,
};

const PLAN: NoteFileMetadata = {
  id: "projects:plan.md",
  entityType: ENTITY_TYPE.NOTE,
  name: "Plan",
  path: "Projects/Plan.md",
  parentId: PROJECTS.id,
  updatedTimestamp: 0,
  isReadOnly: false,
  isTrashed: false,
  contentType: NOTE_CONTENT_TYPE.TEXT,
  size: 0,
};

const JOURNAL: NoteFileMetadata = {
  ...PLAN,
  id: "journal.md",
  name: "Journal",
  path: "Journal.md",
  parentId: undefined,
};
const IDEAS: NoteFileMetadata = { ...PLAN, id: "ideas.md", name: "Ideas", path: "Ideas.md", parentId: undefined };

interface Harness {
  index: Map<string, NoteMetadata>;
  resolver: WikilinkResolver;
  relationshipManager: RelationshipManager;
  sync: NoteReferenceSync;
}

async function createHarness(entries: NoteMetadata[]): Promise<Harness> {
  const store = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(store, new WsBroadcaster());
  await relationshipManager.initialize();
  const index = new Map(entries.map((entry) => [entry.id, entry]));

  return {
    index,
    resolver: new WikilinkResolver(index),
    relationshipManager,
    sync: new NoteReferenceSync(relationshipManager),
  };
}

function getReferences(harness: Harness): Array<[string, string, string]> {
  return harness.relationshipManager
    .queryRelationships({ relationshipType: RELATIONSHIP_TYPE.REFERENCE })
    .map((relationship): [string, string, string] => [
      relationship.sourceEntityId,
      relationship.targetEntityId,
      relationship.targetEntityType,
    ])
    .sort();
}

describe("NoteReferenceSync", () => {
  it("creates one edge per resolved entry, typed by the entry, without self-links or unresolved targets", async () => {
    const harness = await createHarness([PROJECTS, PLAN, JOURNAL]);

    await harness.sync.setNoteTargets(
      new Map([[JOURNAL.id, ["Plan", "projects/plan", "Projects", "Journal", "Missing"]]]),
      harness.resolver
    );

    expect(getReferences(harness)).toEqual([
      [JOURNAL.id, PROJECTS.id, ENTITY_TYPE.NOTE_FOLDER],
      [JOURNAL.id, PLAN.id, ENTITY_TYPE.NOTE],
    ]);
  });

  it("writes only the difference when a note's targets are replaced", async () => {
    const harness = await createHarness([PROJECTS, PLAN, JOURNAL, IDEAS]);
    await harness.sync.setNoteTargets(new Map([[JOURNAL.id, ["Plan", "Projects"]]]), harness.resolver);
    const [kept] = harness.relationshipManager.queryRelationships({ targetEntityId: PLAN.id });

    await harness.sync.setNoteTargets(new Map([[JOURNAL.id, ["Plan", "Ideas"]]]), harness.resolver);

    expect(getReferences(harness)).toEqual([
      [JOURNAL.id, IDEAS.id, ENTITY_TYPE.NOTE],
      [JOURNAL.id, PLAN.id, ENTITY_TYPE.NOTE],
    ]);
    expect(harness.relationshipManager.getRelationship(kept.id)).toEqual(kept);
  });

  it("re-resolves only the notes holding a target segment named by an added or removed entry", async () => {
    const harness = await createHarness([PROJECTS, PLAN, JOURNAL]);
    await harness.sync.setNoteTargets(
      new Map([
        [JOURNAL.id, ["ideas"]],
        [PLAN.id, ["Journal"]],
      ]),
      harness.resolver
    );
    expect(getReferences(harness)).toEqual([[PLAN.id, JOURNAL.id, ENTITY_TYPE.NOTE]]);

    harness.index.set(IDEAS.id, IDEAS);
    await harness.sync.resolveNamedTargets([IDEAS.name], harness.resolver);

    expect(getReferences(harness)).toEqual([
      [JOURNAL.id, IDEAS.id, ENTITY_TYPE.NOTE],
      [PLAN.id, JOURNAL.id, ENTITY_TYPE.NOTE],
    ]);

    harness.index.delete(IDEAS.id);
    await harness.sync.resolveNamedTargets([IDEAS.name], harness.resolver);

    expect(getReferences(harness)).toEqual([[PLAN.id, JOURNAL.id, ENTITY_TYPE.NOTE]]);
  });

  it("moves the targets and both ends of REFERENCE edges to the new ids", async () => {
    const harness = await createHarness([PROJECTS, PLAN, JOURNAL]);
    await harness.sync.setNoteTargets(
      new Map([
        [JOURNAL.id, ["Plan"]],
        [PLAN.id, ["Journal"]],
      ]),
      harness.resolver
    );
    const movedPlan: NoteFileMetadata = { ...PLAN, id: "plan.md", path: "Plan.md", parentId: undefined };

    await harness.sync.changeEntityIds(new Map([[PLAN.id, movedPlan]]));
    harness.index.delete(PLAN.id);
    harness.index.set(movedPlan.id, movedPlan);
    await harness.sync.resolveNamedTargets([JOURNAL.name], harness.resolver);

    expect(getReferences(harness)).toEqual([
      [JOURNAL.id, movedPlan.id, ENTITY_TYPE.NOTE],
      [movedPlan.id, JOURNAL.id, ENTITY_TYPE.NOTE],
    ]);
  });

  it("drops a note's targets and outgoing edges, so later re-resolves leave it without edges", async () => {
    const harness = await createHarness([PROJECTS, PLAN, JOURNAL]);
    await harness.sync.setNoteTargets(
      new Map([
        [JOURNAL.id, ["Plan"]],
        [PLAN.id, ["Journal"]],
      ]),
      harness.resolver
    );

    await harness.sync.dropNotes([PLAN.id]);
    await harness.sync.resolveNamedTargets([JOURNAL.name], harness.resolver);

    expect(getReferences(harness)).toEqual([[JOURNAL.id, PLAN.id, ENTITY_TYPE.NOTE]]);
  });
});
