import { DATA_SOURCE_TYPE, ENTITY_TYPE, type DocumentSearchHit } from "@crow-central-agency/shared";
import type { NotesContextValue } from "../../../providers/notes-provider.types.js";
import { isLiveNoteFile } from "../../../utils/note-utils.js";
import {
  NOTE_PALETTE_TARGET_KIND,
  type ArtifactOwnerNameResolver,
  type NotePaletteEntry,
} from "./note-palette.types.js";

type NoteAccessors = Pick<NotesContextValue, "getNote" | "getAncestorIds">;

interface ResolveRecentNoteEntriesParams {
  notes: NoteAccessors;
  recentNoteIds: string[];
  /** The note on screen in the Notes tab, left out of the list */
  currentNoteId: string | undefined;
}

interface ResolveSearchHitEntriesParams {
  notes: NoteAccessors;
  hits: DocumentSearchHit[];
  getOwnerName: ArtifactOwnerNameResolver;
}

const FOLDER_PATH_SEPARATOR = " / ";

/** Recent notes in recency order; unknown ids, folders and trashed notes are dropped. */
export function resolveRecentNoteEntries({
  notes,
  recentNoteIds,
  currentNoteId,
}: ResolveRecentNoteEntriesParams): NotePaletteEntry[] {
  const entries: NotePaletteEntry[] = [];
  for (const noteId of recentNoteIds) {
    const entry = noteId === currentNoteId ? undefined : toNoteEntry(notes, noteId);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/** Search hits in rank order; folders, notes unknown to the tree and other sources are dropped. */
export function resolveSearchHitEntries({
  notes,
  hits,
  getOwnerName,
}: ResolveSearchHitEntriesParams): NotePaletteEntry[] {
  const entries: NotePaletteEntry[] = [];
  for (const hit of hits) {
    const entry = toHitEntry(notes, hit, getOwnerName);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function toHitEntry(
  notes: NoteAccessors,
  hit: DocumentSearchHit,
  getOwnerName: ArtifactOwnerNameResolver
): NotePaletteEntry | undefined {
  switch (hit.dataSourceType) {
    case DATA_SOURCE_TYPE.NOTE:
      return toNoteEntry(notes, hit.documentId);

    case DATA_SOURCE_TYPE.ARTIFACT:
    case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT: {
      const ownerType = hit.dataSourceType === DATA_SOURCE_TYPE.ARTIFACT ? ENTITY_TYPE.AGENT : ENTITY_TYPE.AGENT_CIRCLE;
      return {
        key: `${hit.dataSourceType}:${hit.provenanceId}:${hit.documentId}`,
        title: hit.title,
        subtitle: getOwnerName(ownerType, hit.provenanceId),
        target: {
          kind: NOTE_PALETTE_TARGET_KIND.ARTIFACT,
          ownerType,
          ownerId: hit.provenanceId,
          filename: hit.documentId,
        },
      };
    }

    case DATA_SOURCE_TYPE.TASK:
    case DATA_SOURCE_TYPE.FRAGMENT:
      return undefined;
  }
}

function toNoteEntry(notes: NoteAccessors, noteId: string): NotePaletteEntry | undefined {
  const metadata = notes.getNote(noteId);
  if (!isLiveNoteFile(metadata)) {
    return undefined;
  }

  const folderNames = notes.getAncestorIds(noteId).map((folderId) => notes.getNote(folderId)?.name ?? folderId);

  return {
    key: `${DATA_SOURCE_TYPE.NOTE}:${noteId}`,
    title: metadata.name,
    subtitle: folderNames.length > 0 ? folderNames.join(FOLDER_PATH_SEPARATOR) : undefined,
    target: { kind: NOTE_PALETTE_TARGET_KIND.NOTE, noteId },
  };
}
