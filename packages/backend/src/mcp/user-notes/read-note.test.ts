import { describe, expect, it, vi } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/client";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
} from "@crow-central-agency/shared";
import { getReadNoteToolConfig } from "./read-note.js";
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

const TEXT_NOTE: NoteFileMetadata = {
  id: "travel:tokyo.md",
  entityType: ENTITY_TYPE.NOTE,
  name: "Tokyo",
  path: "Travel/Tokyo.md",
  parentId: "travel",
  updatedTimestamp: 0,
  isReadOnly: false,
  isTrashed: false,
  contentType: NOTE_CONTENT_TYPE.TEXT,
  size: 17,
};

const IMAGE_NOTE: NoteFileMetadata = {
  ...TEXT_NOTE,
  id: "travel:photo.png",
  name: "photo.png",
  path: "Travel/photo.png",
  isReadOnly: true,
  contentType: NOTE_CONTENT_TYPE.IMAGE,
};

const PDF_NOTE: NoteFileMetadata = {
  ...TEXT_NOTE,
  id: "travel:guide.pdf",
  name: "guide.pdf",
  path: "Travel/guide.pdf",
  isReadOnly: true,
  contentType: NOTE_CONTENT_TYPE.UNKNOWN,
};

const UNKNOWN_NOTE: NoteFileMetadata = {
  ...TEXT_NOTE,
  id: "travel:data.bin",
  name: "data.bin",
  path: "Travel/data.bin",
  isReadOnly: true,
  contentType: NOTE_CONTENT_TYPE.UNKNOWN,
};

const FOLDER: NoteFolderMetadata = {
  id: "travel",
  entityType: ENTITY_TYPE.NOTE_FOLDER,
  name: "Travel",
  path: "Travel",
  updatedTimestamp: 0,
  isReadOnly: true,
  isTrashed: false,
};

const BYTES = Buffer.from([1, 2, 3]);

interface Harness {
  notesManager: NotesManager;
  handler: ReturnType<typeof getReadNoteToolConfig>["handler"];
}

function createHarness(note: NoteFileMetadata | NoteFolderMetadata, content: string | Buffer = BYTES): Harness {
  const store = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(store);
  const tagManager = new TagManager(store, relationshipManager);
  const notesManager = new NotesManager(MOCK_NOTES_PATH, new WsBroadcaster(), relationshipManager, tagManager);
  const sensorManager = new SensorManager(store);
  vi.mocked(sensorManager.getUserTimezone).mockResolvedValue("UTC");
  vi.mocked(notesManager.getNote).mockReturnValue(note);
  if (note.entityType === ENTITY_TYPE.NOTE) {
    vi.mocked(notesManager.getNoteContent).mockResolvedValue({ metadata: note, content });
  }

  return { notesManager, handler: getReadNoteToolConfig(notesManager, sensorManager).handler };
}

function getResultText(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

describe("read_note", () => {
  it("returns a text note's metadata header and a window of its lines", async () => {
    const harness = createHarness(TEXT_NOTE, "line one\nline two\nline three");

    const result = await harness.handler({ id: TEXT_NOTE.id, startLine: 2, limit: 1 }, undefined);
    const text = getResultText(result);

    expect(result.isError).toBeFalsy();
    expect(text).toContain("[Id: travel:tokyo.md | Name: Tokyo | Content: TEXT |");
    expect(text).toContain("[More available: use startLine=3 to continue]");
    expect(text.endsWith("\nline two")).toBe(true);
  });

  it("returns an image note as image content", async () => {
    const harness = createHarness(IMAGE_NOTE);

    const result = await harness.handler({ id: IMAGE_NOTE.id }, undefined);

    expect(result.content[1]).toEqual({ type: "image", data: BYTES.toString("base64"), mimeType: "image/png" });
  });

  it("returns a PDF note as an embedded resource", async () => {
    const harness = createHarness(PDF_NOTE);

    const result = await harness.handler({ id: PDF_NOTE.id }, undefined);

    expect(result.content[1]).toEqual({
      type: "resource",
      resource: { uri: `note://${PDF_NOTE.id}`, mimeType: "application/pdf", blob: BYTES.toString("base64") },
    });
  });

  it("returns only metadata for a note of another type", async () => {
    const harness = createHarness(UNKNOWN_NOTE);

    const result = await harness.handler({ id: UNKNOWN_NOTE.id }, undefined);

    expect(result.content).toHaveLength(1);
    expect(getResultText(result)).toContain("[Binary note: UNKNOWN content (17 bytes).");
  });

  it("reports a trashed note as not found without reading it", async () => {
    const harness = createHarness({ ...TEXT_NOTE, id: `.trash:${TEXT_NOTE.id}`, isTrashed: true });

    const result = await harness.handler({ id: `.trash:${TEXT_NOTE.id}` }, undefined);

    expect(result.isError).toBe(true);
    expect(getResultText(result)).toBe(`Note not found: .trash:${TEXT_NOTE.id}`);
    expect(harness.notesManager.getNoteContent).not.toHaveBeenCalled();
  });

  it("reports an unknown id as not found", async () => {
    const harness = createHarness(TEXT_NOTE);
    vi.mocked(harness.notesManager.getNote).mockImplementation((noteId) => {
      throw new AppError(`Note not found: ${noteId}`, APP_ERROR_CODES.NOT_FOUND);
    });

    const result = await harness.handler({ id: "missing.md" }, undefined);

    expect(result.isError).toBe(true);
    expect(getResultText(result)).toBe("Note not found: missing.md");
  });

  it("rejects a folder id and points to list_notes", async () => {
    const harness = createHarness(FOLDER);

    const result = await harness.handler({ id: FOLDER.id }, undefined);

    expect(result.isError).toBe(true);
    expect(getResultText(result)).toContain("list_notes");
    expect(harness.notesManager.getNoteContent).not.toHaveBeenCalled();
  });
});
