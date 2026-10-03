import type { NoteFileMetadata } from "@crow-central-agency/shared";
import type { LoadNoteImageUrl, NoteImageCacheEntry } from "./note-image-cache.types.js";

/**
 * One object URL per note image, shared by every widget showing it. The URL is
 * revoked only once the last user releases it and its load has settled, so an
 * acquire that arrives in between keeps it alive.
 */
export class NoteImageCache {
  private readonly entries = new Map<string, NoteImageCacheEntry>();

  constructor(private readonly load: LoadNoteImageUrl) {}

  public acquire(note: NoteFileMetadata): Promise<string | undefined> {
    const entry = this.entries.get(note.id) ?? this.createEntry(note);
    entry.users += 1;

    return entry.url;
  }

  public release(noteId: string): void {
    const entry = this.entries.get(noteId);

    if (!entry || entry.users === 0) {
      return;
    }

    entry.users -= 1;

    if (entry.users === 0) {
      entry.url.then(
        (url) => this.evict(noteId, entry, url),
        () => this.evict(noteId, entry, undefined)
      );
    }
  }

  private createEntry(note: NoteFileMetadata): NoteImageCacheEntry {
    const entry = { users: 0, url: this.load(note) };
    this.entries.set(note.id, entry);

    return entry;
  }

  private evict(noteId: string, entry: NoteImageCacheEntry, url: string | undefined): void {
    if (entry.users > 0 || this.entries.get(noteId) !== entry) {
      return;
    }

    this.entries.delete(noteId);

    if (url !== undefined) {
      URL.revokeObjectURL(url);
    }
  }
}
