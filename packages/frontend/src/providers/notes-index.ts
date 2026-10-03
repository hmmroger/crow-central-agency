import type { NoteMetadata } from "@crow-central-agency/shared";

/**
 * Live and trashed note metadata by id. Snapshots share one map, so a new
 * snapshot is how a change is published; only the provider mutates it.
 */
export class NotesIndex {
  constructor(private readonly notesById = new Map<string, NoteMetadata>()) {}

  public readonly getNote = (noteId: string): NoteMetadata | undefined => this.notesById.get(noteId);

  public readonly getChildIds = (parentId: string | undefined, isTrashed: boolean): string[] => {
    const childIds: string[] = [];
    for (const metadata of this.notesById.values()) {
      if (metadata.parentId === parentId && metadata.isTrashed === isTrashed) {
        childIds.push(metadata.id);
      }
    }

    return childIds;
  };

  /** Ancestors root first, then the note; empty when the note is not indexed. */
  public readonly getNotePath = (noteId: string): NoteMetadata[] => {
    const path: NoteMetadata[] = [];
    const visitedIds = new Set<string>();
    let current = this.notesById.get(noteId);

    while (current && !visitedIds.has(current.id)) {
      visitedIds.add(current.id);
      path.push(current);
      current = current.parentId ? this.notesById.get(current.parentId) : undefined;
    }

    return path.reverse();
  };

  public set(metadata: NoteMetadata): void {
    this.notesById.set(metadata.id, metadata);
  }

  public delete(noteId: string): void {
    this.notesById.delete(noteId);
  }

  /** Replaces every live or every trashed entry with `notes`, returning the ids that left. */
  public replace(isTrashed: boolean, notes: NoteMetadata[]): string[] {
    const listedIds = new Set(notes.map((metadata) => metadata.id));
    const removedIds: string[] = [];

    for (const metadata of this.notesById.values()) {
      if (metadata.isTrashed === isTrashed && !listedIds.has(metadata.id)) {
        removedIds.push(metadata.id);
      }
    }

    for (const noteId of removedIds) {
      this.notesById.delete(noteId);
    }

    for (const metadata of notes) {
      this.notesById.set(metadata.id, metadata);
    }

    return removedIds;
  }

  public snapshot(): NotesIndex {
    return new NotesIndex(this.notesById);
  }
}
