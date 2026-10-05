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

  /** Ids of the note's ancestor folders, root first, excluding the note. */
  public readonly getAncestorIds = (noteId: string): string[] => {
    const ancestorIds: string[] = [];
    const visitedIds = new Set([noteId]);
    let parentId = this.notesById.get(noteId)?.parentId;

    while (parentId !== undefined && !visitedIds.has(parentId) && this.notesById.has(parentId)) {
      visitedIds.add(parentId);
      ancestorIds.push(parentId);
      parentId = this.notesById.get(parentId)?.parentId;
    }

    return ancestorIds.reverse();
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
