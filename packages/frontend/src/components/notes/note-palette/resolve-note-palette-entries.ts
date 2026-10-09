import { DATA_SOURCE_TYPE, ENTITY_TYPE, type DocumentSearchHit } from "@crow-central-agency/shared";
import type { NotesContextValue } from "../../../providers/notes-provider.types.js";
import { DOCUMENT_REF_KIND, type ArtifactDocumentRef, type DocumentRef } from "../../../utils/document-ref.types.js";
import { isLiveNoteFile } from "../../../utils/note-utils.js";
import type { ArtifactOwnerNameResolver, NotePaletteEntry } from "./note-palette.types.js";

type NoteAccessors = Pick<NotesContextValue, "getNote" | "getAncestorIds">;

interface ResolveRecentEntriesParams {
  notes: NoteAccessors;
  recentDocuments: DocumentRef[];
  /** The note on screen in the Notes tab, left out of the list */
  currentNoteId: string | undefined;
  getOwnerName: ArtifactOwnerNameResolver;
}

interface ResolveSearchHitEntriesParams {
  notes: NoteAccessors;
  hits: DocumentSearchHit[];
  getOwnerName: ArtifactOwnerNameResolver;
}

const FOLDER_PATH_SEPARATOR = " / ";

/** Recent notes and artifacts in recency order; the open note and entries that no longer resolve are dropped. */
export function resolveRecentEntries({
  notes,
  recentDocuments,
  currentNoteId,
  getOwnerName,
}: ResolveRecentEntriesParams): NotePaletteEntry[] {
  const entries: NotePaletteEntry[] = [];
  for (const documentRef of recentDocuments) {
    const entry = toRecentEntry(notes, documentRef, currentNoteId, getOwnerName);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/** Search hits in rank order; folders, unknown notes, ownerless artifacts and other sources are dropped. */
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

function toRecentEntry(
  notes: NoteAccessors,
  documentRef: DocumentRef,
  currentNoteId: string | undefined,
  getOwnerName: ArtifactOwnerNameResolver
): NotePaletteEntry | undefined {
  switch (documentRef.kind) {
    case DOCUMENT_REF_KIND.NOTE:
      return documentRef.noteId === currentNoteId ? undefined : toNoteEntry(notes, documentRef.noteId);

    case DOCUMENT_REF_KIND.ARTIFACT:
      return toArtifactEntry(documentRef, getOwnerName);
  }
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
    case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
      return toArtifactEntry(
        {
          kind: DOCUMENT_REF_KIND.ARTIFACT,
          ownerType: hit.dataSourceType === DATA_SOURCE_TYPE.ARTIFACT ? ENTITY_TYPE.AGENT : ENTITY_TYPE.AGENT_CIRCLE,
          ownerId: hit.provenanceId,
          filename: hit.documentId,
        },
        getOwnerName
      );

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
    key: `${DOCUMENT_REF_KIND.NOTE}:${noteId}`,
    title: metadata.name,
    subtitle: folderNames.length > 0 ? folderNames.join(FOLDER_PATH_SEPARATOR) : undefined,
    target: { kind: DOCUMENT_REF_KIND.NOTE, noteId },
  };
}

function toArtifactEntry(
  documentRef: ArtifactDocumentRef,
  getOwnerName: ArtifactOwnerNameResolver
): NotePaletteEntry | undefined {
  const ownerName = getOwnerName(documentRef.ownerType, documentRef.ownerId);
  if (!ownerName) {
    return undefined;
  }

  return {
    key: `${DOCUMENT_REF_KIND.ARTIFACT}:${documentRef.ownerType}:${documentRef.ownerId}:${documentRef.filename}`,
    title: documentRef.filename,
    subtitle: ownerName,
    target: documentRef,
  };
}
