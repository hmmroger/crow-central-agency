import { ENTITY_TYPE, NOTE_CONTENT_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { logger } from "../../../utils/logger.js";
import type { NotesManager } from "../../notes/notes-manager.js";
import type { TagManager } from "../../tag/tag-manager.js";
import {
  DATA_SOURCE_TYPE,
  GLOBAL_PROVENANCE_ID,
  type DocumentRef,
  type SearchDocument,
  type SearchSource,
  type SearchSourceListener,
} from "../document-search-service.types.js";
import { LatestReadTracker } from "./latest-read-tracker.js";

const log = logger.child({ context: "note-search-source" });

/** Indexes every live note and folder: name as title, content as text for text notes, tags from TagManager. */
export class NoteSearchSource implements SearchSource {
  public readonly dataSourceTypes = [DATA_SOURCE_TYPE.NOTE];
  private readonly liveReads = new LatestReadTracker();

  constructor(
    private readonly notesManager: NotesManager,
    private readonly tagManager: TagManager
  ) {}

  public async *loadAll(): AsyncIterable<SearchDocument> {
    for (const metadata of this.notesManager.listNotes({ isRecursive: true })) {
      const document = await this.readDocument(metadata);
      if (document) {
        yield document;
      }
    }
  }

  public subscribe(listener: SearchSourceListener): void {
    this.notesManager.on("noteCreated", ({ metadata }) => void this.reportNote(listener, metadata));
    this.notesManager.on("noteUpdated", ({ metadata }) => void this.reportNote(listener, metadata));
    this.notesManager.on("noteDeleted", ({ noteId }) => this.reportDeletedNote(listener, noteId));
  }

  /** Reports a live entry; the trash is never indexed, so a trashed entry is ignored */
  private async reportNote(listener: SearchSourceListener, metadata: NoteMetadata): Promise<void> {
    if (metadata.isTrashed) {
      return;
    }

    const document = await this.liveReads.readLatest(this.toRef(metadata.id), () => this.readDocument(metadata));
    if (document) {
      listener.onDocumentUpdate(document);
    }
  }

  /** A removal also cancels any read still in flight for the note */
  private reportDeletedNote(listener: SearchSourceListener, noteId: string): void {
    const ref = this.toRef(noteId);
    this.liveReads.cancel(ref);
    listener.onDocumentRemove(ref);
  }

  /** Builds the entry's document, reading content for types that have text; a failed read is logged and returns undefined. */
  private async readDocument(metadata: NoteMetadata): Promise<SearchDocument | undefined> {
    try {
      return this.toDocument(metadata, await this.readText(metadata));
    } catch (error) {
      log.error({ error, noteId: metadata.id }, "Failed to index note");
      return undefined;
    }
  }

  private async readText(metadata: NoteMetadata): Promise<string> {
    if (metadata.entityType !== ENTITY_TYPE.NOTE || metadata.contentType !== NOTE_CONTENT_TYPE.TEXT) {
      return "";
    }

    const { content } = await this.notesManager.getNoteContent(metadata.id);
    return typeof content === "string" ? content : "";
  }

  private toDocument(metadata: NoteMetadata, text: string): SearchDocument {
    const tags = this.tagManager.getEntityTags(metadata.entityType, metadata.id).map((tag) => tag.name);
    return {
      ...this.toRef(metadata.id),
      title: metadata.name,
      text,
      tags: tags.length ? tags : undefined,
    };
  }

  private toRef(noteId: string): DocumentRef {
    return { documentId: noteId, dataSourceType: DATA_SOURCE_TYPE.NOTE, provenanceId: GLOBAL_PROVENANCE_ID };
  }
}
