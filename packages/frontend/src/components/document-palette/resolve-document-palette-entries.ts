import { DATA_SOURCE_TYPE, toDocumentUid, type DocumentRef } from "@crow-central-agency/shared";
import type { NotesContextValue } from "../../providers/notes-provider.types.js";
import { isLiveNoteFile } from "../../utils/note-utils.js";
import type { DocumentOwnerNameResolver, DocumentPaletteEntry } from "./document-palette.types.js";

type NoteAccessors = Pick<NotesContextValue, "getNote" | "getAncestorIds">;

interface ResolveDocumentPaletteEntriesParams {
  notes: NoteAccessors;
  /** Recent documents or search hits, in display order */
  documents: readonly DocumentRef[];
  getOwnerName: DocumentOwnerNameResolver;
  /** The note on screen in the Notes tab, left out of the list */
  excludedNoteId?: string;
}

const FOLDER_PATH_SEPARATOR = " / ";

/** Rows in input order; the excluded note, folders, unknown notes, ownerless artifacts and other sources are dropped. */
export function resolveDocumentPaletteEntries({
  notes,
  documents,
  getOwnerName,
  excludedNoteId,
}: ResolveDocumentPaletteEntriesParams): DocumentPaletteEntry[] {
  const entries: DocumentPaletteEntry[] = [];
  for (const { documentId, dataSourceType, provenanceId } of documents) {
    const entry = toEntry(notes, { documentId, dataSourceType, provenanceId }, getOwnerName, excludedNoteId);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function toEntry(
  notes: NoteAccessors,
  documentRef: DocumentRef,
  getOwnerName: DocumentOwnerNameResolver,
  excludedNoteId: string | undefined
): DocumentPaletteEntry | undefined {
  switch (documentRef.dataSourceType) {
    case DATA_SOURCE_TYPE.NOTE:
      return documentRef.documentId === excludedNoteId ? undefined : toNoteEntry(notes, documentRef);

    case DATA_SOURCE_TYPE.ARTIFACT:
    case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
      return toArtifactEntry(documentRef, getOwnerName);

    case DATA_SOURCE_TYPE.TASK:
    case DATA_SOURCE_TYPE.FRAGMENT:
      return undefined;
  }
}

function toNoteEntry(notes: NoteAccessors, documentRef: DocumentRef): DocumentPaletteEntry | undefined {
  const noteId = documentRef.documentId;
  const metadata = notes.getNote(noteId);
  if (!isLiveNoteFile(metadata)) {
    return undefined;
  }

  const folderNames = notes.getAncestorIds(noteId).map((folderId) => notes.getNote(folderId)?.name ?? folderId);

  return {
    key: toDocumentUid(documentRef),
    title: metadata.name,
    subtitle: folderNames.length > 0 ? folderNames.join(FOLDER_PATH_SEPARATOR) : undefined,
    target: documentRef,
  };
}

function toArtifactEntry(
  documentRef: DocumentRef,
  getOwnerName: DocumentOwnerNameResolver
): DocumentPaletteEntry | undefined {
  const ownerName = getOwnerName(documentRef);
  if (!ownerName) {
    return undefined;
  }

  return {
    key: toDocumentUid(documentRef),
    title: documentRef.documentId,
    subtitle: ownerName,
    target: documentRef,
  };
}
