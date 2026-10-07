import { describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/client";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
} from "@crow-central-agency/shared";
import { getListNotesToolConfig } from "./list-notes.js";
import { NotesManager } from "../../services/notes/notes-manager.js";
import { TagManager } from "../../services/tag/tag-manager.js";
import { RelationshipManager } from "../../services/relationship-manager.js";
import { WsBroadcaster } from "../../services/ws-broadcaster.js";
import { SensorManager } from "../../sensors/sensor-manager.js";
import { InMemoryObjectStore } from "../../core/store/in-memory-object-store.mock.js";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

vi.mock("../../services/notes/notes-manager.js");
vi.mock("../../services/tag/tag-manager.js");
vi.mock("../../services/relationship-manager.js");
vi.mock("../../services/ws-broadcaster.js");
vi.mock("../../sensors/sensor-manager.js");

const MOCK_NOTES_PATH = "mock-notes-root";

const FOLDER: NoteFolderMetadata = {
  id: "travel",
  entityType: ENTITY_TYPE.NOTE_FOLDER,
  name: "Travel",
  path: "Travel",
  updatedTimestamp: 0,
  isReadOnly: true,
  isTrashed: false,
};

const NOTE_A: NoteFileMetadata = {
  id: "alpha.md",
  entityType: ENTITY_TYPE.NOTE,
  name: "Alpha",
  path: "Alpha.md",
  updatedTimestamp: 0,
  isReadOnly: false,
  isTrashed: false,
  contentType: NOTE_CONTENT_TYPE.TEXT,
  size: 10,
};

const NOTE_Z: NoteFileMetadata = { ...NOTE_A, id: "zulu.md", name: "Zulu", path: "Zulu.md", size: 20 };

interface Harness {
  notesManager: NotesManager;
  handler: ReturnType<typeof getListNotesToolConfig>["handler"];
}

function createHarness(): Harness {
  const store = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(store);
  const tagManager = new TagManager(store, relationshipManager);
  const notesManager = new NotesManager(MOCK_NOTES_PATH, new WsBroadcaster(), relationshipManager, tagManager);
  const sensorManager = new SensorManager(store);
  vi.mocked(sensorManager.getUserTimezone).mockResolvedValue("UTC");

  return { notesManager, handler: getListNotesToolConfig(notesManager, sensorManager).handler };
}

function getResultText(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

describe("list_notes", () => {
  it("lists the root's direct children, folders first then by name, with sizes for notes", async () => {
    const harness = createHarness();
    vi.mocked(harness.notesManager.listNotes).mockReturnValue([NOTE_Z, FOLDER, NOTE_A]);

    const result = await harness.handler({}, undefined);
    const lines = getResultText(result).split("\n");

    expect(harness.notesManager.listNotes).toHaveBeenCalledWith({ parentId: undefined });
    expect(result.isError).toBeFalsy();
    const entryLines = lines.filter((line) => line.startsWith("- "));
    expect(entryLines).toHaveLength(3);
    expect(entryLines[0]).toMatch(/^- Id: travel \(folder\) Name: Travel Updated: /);
    expect(entryLines[1]).toMatch(/^- Id: alpha\.md \(note, TEXT\) Name: Alpha Updated: .* Size: 10 bytes$/);
    expect(entryLines[2]).toMatch(/^- Id: zulu\.md /);
  });

  it("pages the entries of the given folder", async () => {
    const harness = createHarness();
    vi.mocked(harness.notesManager.listNotes).mockReturnValue([NOTE_Z, NOTE_A]);

    const result = await harness.handler({ folderId: FOLDER.id, limit: 1, offset: 1 }, undefined);
    const text = getResultText(result);

    expect(harness.notesManager.listNotes).toHaveBeenCalledWith({ parentId: FOLDER.id });
    expect(text).toContain("Total: 2");
    expect(text).toContain("- Id: zulu.md");
    expect(text).not.toContain("- Id: alpha.md");
  });

  it("returns an error when the id is not a live folder", async () => {
    const harness = createHarness();
    vi.mocked(harness.notesManager.listNotes).mockImplementation(() => {
      throw new AppError(`Folder not found: ${NOTE_A.id}`, APP_ERROR_CODES.NOT_FOUND);
    });

    const result = await harness.handler({ folderId: NOTE_A.id }, undefined);

    expect(result.isError).toBe(true);
    expect(getResultText(result)).toBe(`Folder not found: ${NOTE_A.id}`);
  });
});
