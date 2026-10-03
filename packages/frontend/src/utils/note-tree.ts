import { ENTITY_TYPE, type NoteMetadata } from "@crow-central-agency/shared";

/** A note composed for display, with the notes nested under it. */
export interface NoteTreeEntry {
  metadata: NoteMetadata;
  children: NoteTreeEntry[];
}

/**
 * Compose the flat note list into a display tree via `parentId`.
 * Notes whose parent is missing from the list are treated as roots.
 */
export function buildNoteTree(notes: NoteMetadata[]): NoteTreeEntry[] {
  const entriesById = new Map<string, NoteTreeEntry>();
  for (const metadata of notes) {
    entriesById.set(metadata.id, { metadata, children: [] });
  }

  const roots: NoteTreeEntry[] = [];
  for (const entry of entriesById.values()) {
    const parent = entry.metadata.parentId ? entriesById.get(entry.metadata.parentId) : undefined;
    if (parent) {
      parent.children.push(entry);
    } else {
      roots.push(entry);
    }
  }

  sortNoteEntries(roots);

  return roots;
}

/**
 * Ids of every ancestor of `noteId`, walking up the `parentId` chain.
 * The note itself is not included.
 */
export function collectAncestorIds(notes: NoteMetadata[], noteId: string): string[] {
  return collectAncestorIdsById(buildMetadataById(notes), noteId);
}

function buildMetadataById(notes: NoteMetadata[]): Map<string, NoteMetadata> {
  return new Map(notes.map((metadata) => [metadata.id, metadata]));
}

function collectAncestorIdsById(metadataById: Map<string, NoteMetadata>, noteId: string): string[] {
  const ancestorIds: string[] = [];
  let parentId = metadataById.get(noteId)?.parentId;

  while (parentId !== undefined && !ancestorIds.includes(parentId)) {
    ancestorIds.push(parentId);
    parentId = metadataById.get(parentId)?.parentId;
  }

  return ancestorIds;
}

/**
 * Folders a note may be moved into: every folder except the note itself and
 * its own descendants, which the backend rejects.
 */
export function getMoveDestinations(notes: NoteMetadata[], movedNote: NoteMetadata): NoteMetadata[] {
  const metadataById = buildMetadataById(notes);

  return notes.filter(
    (metadata) =>
      metadata.entityType === ENTITY_TYPE.NOTE_FOLDER &&
      metadata.id !== movedNote.id &&
      !collectAncestorIdsById(metadataById, metadata.id).includes(movedNote.id)
  );
}

/** Folders first, then by name — an order that does not shift as notes are edited. */
function sortNoteEntries(entries: NoteTreeEntry[]): void {
  entries.sort(compareNoteEntries);
  for (const entry of entries) {
    sortNoteEntries(entry.children);
  }
}

function compareNoteEntries(first: NoteTreeEntry, second: NoteTreeEntry): number {
  const isFirstFolder = first.metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  const isSecondFolder = second.metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
  if (isFirstFolder !== isSecondFolder) {
    return isFirstFolder ? -1 : 1;
  }

  return first.metadata.name.localeCompare(second.metadata.name);
}
