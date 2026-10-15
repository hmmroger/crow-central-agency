import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENTITY_TYPE, RELATIONSHIP_TYPE } from "@crow-central-agency/shared";
import { NotesManager } from "./notes-manager.js";
import { RelationshipManager } from "../relationship-manager.js";
import { TagManager } from "../tag/tag-manager.js";
import { WsBroadcaster } from "../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { clearTempSystemPath, getTempSystemPath } from "../../utils/test-system-path.mock.js";

const NOTES_FOLDER = "notes";

interface Harness {
  notesManager: NotesManager;
  relationshipManager: RelationshipManager;
}

async function createHarness(files: Record<string, string>): Promise<Harness> {
  const notesPath = path.join(getTempSystemPath(), NOTES_FOLDER);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(notesPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  const store = new InMemoryObjectStore();
  const broadcaster = new WsBroadcaster();
  const relationshipManager = new RelationshipManager(store, broadcaster);
  await relationshipManager.initialize();
  const tagManager = new TagManager(store, relationshipManager, broadcaster);
  await tagManager.initialize();
  const notesManager = new NotesManager(notesPath, broadcaster, tagManager, relationshipManager);
  await notesManager.initialize();

  return { notesManager, relationshipManager };
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

afterEach(clearTempSystemPath);

describe("NotesManager references", () => {
  it("builds one edge per resolved live entry at startup, counting embeds, without self-links or unresolved targets", async () => {
    const harness = await createHarness({
      "Projects/Plan.md": "",
      "Ideas.md": "",
      "Journal.md": "[[Plan]] [[projects/plan]] [[Projects]] ![[Ideas]] [[Journal]] [[Missing]]",
    });

    expect(getReferences(harness)).toEqual([
      ["journal.md", "ideas.md", ENTITY_TYPE.NOTE],
      ["journal.md", "projects", ENTITY_TYPE.NOTE_FOLDER],
      ["journal.md", "projects:plan.md", ENTITY_TYPE.NOTE],
    ]);
  });

  it("writes only the difference when a note's content changes", async () => {
    const harness = await createHarness({ "Plan.md": "", "Ideas.md": "", "Journal.md": "[[Plan]] [[Missing]]" });
    const [kept] = harness.relationshipManager.queryRelationships({ targetEntityId: "plan.md" });
    const journal = harness.notesManager.getNote("journal.md");

    await harness.notesManager.writeNoteContent(journal.id, "[[Plan]] [[Ideas]]", journal.updatedTimestamp);

    expect(getReferences(harness)).toEqual([
      ["journal.md", "ideas.md", ENTITY_TYPE.NOTE],
      ["journal.md", "plan.md", ENTITY_TYPE.NOTE],
    ]);
    expect(harness.relationshipManager.getRelationship(kept.id)).toEqual(kept);
  });

  it("resolves a waiting link when the entry it names is created, matching segments case-insensitively", async () => {
    const harness = await createHarness({ "Projects/Plan.md": "", "Journal.md": "[[projects/IDEAS]]" });

    await harness.notesManager.createNote("Ideas", "", { parentId: "projects" });

    expect(getReferences(harness)).toEqual([["journal.md", "projects:ideas.md", ENTITY_TYPE.NOTE]]);
  });

  it("drops a trashed note's outgoing and incoming edges and brings them back on restore", async () => {
    const harness = await createHarness({ "Plan.md": "[[Journal]]", "Journal.md": "[[Plan]]" });

    await harness.notesManager.deleteNote("plan.md");

    expect(getReferences(harness)).toEqual([]);

    await harness.notesManager.restoreNote(".trash:plan.md");

    expect(getReferences(harness)).toEqual([
      ["journal.md", "plan.md", ENTITY_TYPE.NOTE],
      ["plan.md", "journal.md", ENTITY_TYPE.NOTE],
    ]);
  });

  it("moves a renamed folder's descendant edges to their new ids and drops links that named the old path", async () => {
    const harness = await createHarness({ "Projects/Plan.md": "[[Journal]]", "Journal.md": "[[projects/plan]]" });

    await harness.notesManager.renameOrMove("projects", { name: "Work" });

    expect(getReferences(harness)).toEqual([["work:plan.md", "journal.md", ENTITY_TYPE.NOTE]]);
  });

  it("keeps the note operation when an edge write fails", async () => {
    const harness = await createHarness({ "Plan.md": "", "Journal.md": "" });
    vi.spyOn(harness.relationshipManager, "createRelationships").mockRejectedValue(new Error("store down"));
    const journal = harness.notesManager.getNote("journal.md");

    const updated = await harness.notesManager.writeNoteContent(journal.id, "[[Plan]]", journal.updatedTimestamp);

    expect(updated.id).toBe(journal.id);
    expect(getReferences(harness)).toEqual([]);
  });
});
