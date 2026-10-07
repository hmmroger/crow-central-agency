import { describe, expect, it, vi } from "vitest";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { NoteSearchSource } from "./note-search-source.js";
import { NotesManager } from "../../notes/notes-manager.js";
import { TagManager } from "../../tag/tag-manager.js";
import { RelationshipManager } from "../../relationship-manager.js";
import { WsBroadcaster } from "../../ws-broadcaster.js";
import { InMemoryObjectStore } from "../../../core/store/in-memory-object-store.mock.js";
import { DATA_SOURCE_TYPE, GLOBAL_PROVENANCE_ID, type SearchDocument } from "../document-search-service.types.js";

vi.mock("../../notes/notes-manager.js");
vi.mock("../../tag/tag-manager.js");
vi.mock("../../relationship-manager.js");
vi.mock("../../ws-broadcaster.js");

const MOCK_NOTES_PATH = "mock-notes-root";

const FOLDER: NoteFolderMetadata = {
  id: "travel",
  entityType: ENTITY_TYPE.NOTE_FOLDER,
  name: "Travel",
  path: "Travel",
  updatedTimestamp: 1,
  isReadOnly: true,
  isTrashed: false,
};

const TEXT_NOTE: NoteFileMetadata = {
  id: "travel:tokyo.md",
  entityType: ENTITY_TYPE.NOTE,
  name: "Tokyo",
  path: "Travel/Tokyo.md",
  parentId: "travel",
  updatedTimestamp: 2,
  isReadOnly: false,
  isTrashed: false,
  contentType: NOTE_CONTENT_TYPE.TEXT,
  size: 12,
};

const IMAGE_NOTE: NoteFileMetadata = {
  id: "travel:photo.png",
  entityType: ENTITY_TYPE.NOTE,
  name: "photo.png",
  path: "Travel/photo.png",
  parentId: "travel",
  updatedTimestamp: 3,
  isReadOnly: true,
  isTrashed: false,
  contentType: NOTE_CONTENT_TYPE.IMAGE,
  size: 64,
};

const TEXT_CONTENT = "Ramen in Shinjuku";

interface Harness {
  notesManager: NotesManager;
  tagManager: TagManager;
  source: NoteSearchSource;
}

function createHarness(notes: NoteMetadata[]): Harness {
  const store = new InMemoryObjectStore();
  const relationshipManager = new RelationshipManager(store);
  const tagManager = new TagManager(store, relationshipManager);
  const notesManager = new NotesManager(MOCK_NOTES_PATH, new WsBroadcaster(), relationshipManager, tagManager);
  vi.mocked(notesManager.listNotes).mockReturnValue(notes);
  vi.mocked(notesManager.getNoteContent).mockResolvedValue({ metadata: TEXT_NOTE, content: TEXT_CONTENT });
  vi.mocked(tagManager.getEntityTags).mockImplementation((_entityType, entityId) =>
    entityId === TEXT_NOTE.id ? [{ id: "tag-1", name: "food", createdTimestamp: 0 }] : []
  );

  return { notesManager, tagManager, source: new NoteSearchSource(notesManager, tagManager) };
}

function toRef(noteId: string) {
  return { documentId: noteId, dataSourceType: DATA_SOURCE_TYPE.NOTE, provenanceId: GLOBAL_PROVENANCE_ID };
}

async function collect(documents: AsyncIterable<SearchDocument>): Promise<SearchDocument[]> {
  const collected: SearchDocument[] = [];
  for await (const document of documents) {
    collected.push(document);
  }

  return collected;
}

function flushListeners(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("NoteSearchSource.loadAll", () => {
  it("indexes every live entry by name, with text and tags for text notes", async () => {
    const harness = createHarness([FOLDER, TEXT_NOTE, IMAGE_NOTE]);

    const documents = await collect(harness.source.loadAll());

    expect(harness.notesManager.listNotes).toHaveBeenCalledWith({ isRecursive: true });
    expect(harness.notesManager.getNoteContent).toHaveBeenCalledTimes(1);
    expect(harness.notesManager.getNoteContent).toHaveBeenCalledWith(TEXT_NOTE.id);
    expect(harness.tagManager.getEntityTags).toHaveBeenCalledWith(ENTITY_TYPE.NOTE_FOLDER, FOLDER.id);
    expect(documents).toEqual([
      { ...toRef(FOLDER.id), title: "Travel", text: "", tags: undefined },
      { ...toRef(TEXT_NOTE.id), title: "Tokyo", text: TEXT_CONTENT, tags: ["food"] },
      { ...toRef(IMAGE_NOTE.id), title: "photo.png", text: "", tags: undefined },
    ]);
  });

  it("skips a note whose content cannot be read and keeps indexing the rest", async () => {
    const harness = createHarness([TEXT_NOTE, IMAGE_NOTE]);
    vi.mocked(harness.notesManager.getNoteContent).mockRejectedValue(new Error("read failed"));

    const documents = await collect(harness.source.loadAll());

    expect(documents.map((document) => document.documentId)).toEqual([IMAGE_NOTE.id]);
  });
});

describe("NoteSearchSource.subscribe", () => {
  it("reports created and updated entries as updates and deleted entries as removals", async () => {
    const harness = createHarness([]);
    const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
    harness.source.subscribe(listener);
    const handlers = new Map(vi.mocked(harness.notesManager.on).mock.calls);

    handlers.get("noteCreated")?.({ metadata: TEXT_NOTE });
    handlers.get("noteUpdated")?.({ metadata: FOLDER });
    handlers.get("noteDeleted")?.({ noteId: IMAGE_NOTE.id });
    await flushListeners();

    expect(listener.onDocumentUpdate).toHaveBeenCalledWith({
      ...toRef(TEXT_NOTE.id),
      title: "Tokyo",
      text: TEXT_CONTENT,
      tags: ["food"],
    });
    expect(listener.onDocumentUpdate).toHaveBeenCalledWith({
      ...toRef(FOLDER.id),
      title: "Travel",
      text: "",
      tags: undefined,
    });
    expect(listener.onDocumentRemove).toHaveBeenCalledWith(toRef(IMAGE_NOTE.id));
  });

  it("skips an update whose read fails", async () => {
    const harness = createHarness([]);
    vi.mocked(harness.notesManager.getNoteContent).mockRejectedValue(new Error("read failed"));
    const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
    harness.source.subscribe(listener);
    const handlers = new Map(vi.mocked(harness.notesManager.on).mock.calls);

    handlers.get("noteUpdated")?.({ metadata: TEXT_NOTE });
    await flushListeners();

    expect(listener.onDocumentUpdate).not.toHaveBeenCalled();
  });

  it("indexes a text note whose content comes back as bytes without text", async () => {
    const harness = createHarness([]);
    vi.mocked(harness.notesManager.getNoteContent).mockResolvedValue({
      metadata: TEXT_NOTE,
      content: Buffer.from(TEXT_CONTENT),
    });
    const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
    harness.source.subscribe(listener);
    const handlers = new Map(vi.mocked(harness.notesManager.on).mock.calls);

    handlers.get("noteCreated")?.({ metadata: TEXT_NOTE });
    await flushListeners();

    expect(listener.onDocumentUpdate).toHaveBeenCalledWith({
      ...toRef(TEXT_NOTE.id),
      title: "Tokyo",
      text: "",
      tags: ["food"],
    });
  });

  it("drops a read that a later event for the same note overtook", async () => {
    const harness = createHarness([]);
    const pendingReads: Array<() => void> = [];
    vi.mocked(harness.notesManager.getNoteContent).mockImplementation(
      () =>
        new Promise((resolve) => {
          const content = `${TEXT_CONTENT} ${pendingReads.length + 1}`;
          pendingReads.push(() => resolve({ metadata: TEXT_NOTE, content }));
        })
    );
    const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
    harness.source.subscribe(listener);
    const handlers = new Map(vi.mocked(harness.notesManager.on).mock.calls);

    handlers.get("noteUpdated")?.({ metadata: TEXT_NOTE });
    handlers.get("noteUpdated")?.({ metadata: TEXT_NOTE });
    await flushListeners();
    const [firstRead, secondRead] = pendingReads;
    secondRead();
    await flushListeners();
    firstRead();
    await flushListeners();

    expect(listener.onDocumentUpdate).toHaveBeenCalledTimes(1);
    expect(listener.onDocumentUpdate).toHaveBeenCalledWith(expect.objectContaining({ text: `${TEXT_CONTENT} 2` }));
  });

  it("drops a read still in flight when the note is deleted", async () => {
    const harness = createHarness([]);
    const pendingReads: Array<() => void> = [];
    vi.mocked(harness.notesManager.getNoteContent).mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingReads.push(() => resolve({ metadata: TEXT_NOTE, content: TEXT_CONTENT }));
        })
    );
    const listener = { onDocumentUpdate: vi.fn(), onDocumentRemove: vi.fn() };
    harness.source.subscribe(listener);
    const handlers = new Map(vi.mocked(harness.notesManager.on).mock.calls);

    handlers.get("noteUpdated")?.({ metadata: TEXT_NOTE });
    handlers.get("noteDeleted")?.({ noteId: TEXT_NOTE.id });
    await flushListeners();
    pendingReads[0]();
    await flushListeners();

    expect(listener.onDocumentRemove).toHaveBeenCalledWith(toRef(TEXT_NOTE.id));
    expect(listener.onDocumentUpdate).not.toHaveBeenCalled();
  });
});
