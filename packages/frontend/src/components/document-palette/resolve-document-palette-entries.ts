import { DATA_SOURCE_TYPE, toDocumentUid } from "@crow-central-agency/shared";
import type { NotesContextValue } from "../../providers/notes-provider.types.js";
import { isLiveNoteFile } from "../../utils/note-utils.js";
import {
  DOCUMENT_PALETTE_ENTRY_TYPE,
  type DocumentPaletteEntry,
  type DocumentPaletteSource,
  type DocumentSubtitleResolver,
} from "./document-palette.types.js";

type NoteAccessors = Pick<NotesContextValue, "getNote" | "getAncestorIds">;

interface ResolveDocumentPaletteEntriesParams {
  notes: NoteAccessors;
  /** Recent documents or search hits, in display order */
  documents: readonly DocumentPaletteSource[];
  getSubtitle: DocumentSubtitleResolver;
  /** The note on screen in the Notes tab, left out of the list */
  excludedNoteId?: string;
}

const FOLDER_PATH_SEPARATOR = " / ";

/**
 * Rows in input order; the excluded note, folders, unknown notes, ownerless artifacts, fragments
 * without a search hit title and other sources are dropped.
 */
export function resolveDocumentPaletteEntries({
  notes,
  documents,
  getSubtitle,
  excludedNoteId,
}: ResolveDocumentPaletteEntriesParams): DocumentPaletteEntry[] {
  const entries: DocumentPaletteEntry[] = [];
  for (const document of documents) {
    const entry = toEntry(notes, document, getSubtitle, excludedNoteId);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function toEntry(
  notes: NoteAccessors,
  document: DocumentPaletteSource,
  getSubtitle: DocumentSubtitleResolver,
  excludedNoteId: string | undefined
): DocumentPaletteEntry | undefined {
  switch (document.dataSourceType) {
    case DATA_SOURCE_TYPE.NOTE:
      return document.documentId === excludedNoteId ? undefined : toNoteEntry(notes, document);

    case DATA_SOURCE_TYPE.ARTIFACT:
    case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
      return toArtifactEntry(document, getSubtitle);

    case DATA_SOURCE_TYPE.FRAGMENT:
      return toFragmentEntry(document, getSubtitle);

    case DATA_SOURCE_TYPE.TASK:
      return undefined;
  }
}

function toNoteEntry(notes: NoteAccessors, document: DocumentPaletteSource): DocumentPaletteEntry | undefined {
  const noteId = document.documentId;
  const metadata = notes.getNote(noteId);
  if (!isLiveNoteFile(metadata)) {
    return undefined;
  }

  const folderNames = notes.getAncestorIds(noteId).map((folderId) => notes.getNote(folderId)?.name ?? folderId);

  return {
    key: toDocumentUid(document),
    type: DOCUMENT_PALETTE_ENTRY_TYPE.NOTE,
    title: metadata.name,
    subtitle: folderNames.length > 0 ? folderNames.join(FOLDER_PATH_SEPARATOR) : undefined,
    target: document,
  };
}

function toArtifactEntry(
  document: DocumentPaletteSource,
  getSubtitle: DocumentSubtitleResolver
): DocumentPaletteEntry | undefined {
  const subtitle = getSubtitle(document);
  if (!subtitle) {
    return undefined;
  }

  return {
    key: toDocumentUid(document),
    type: DOCUMENT_PALETTE_ENTRY_TYPE.ARTIFACT,
    title: document.documentId,
    subtitle,
    target: document,
  };
}

/** A bare ref has no cue to show, so only search hits resolve */
function toFragmentEntry(
  document: DocumentPaletteSource,
  getSubtitle: DocumentSubtitleResolver
): DocumentPaletteEntry | undefined {
  if (document.title === undefined) {
    return undefined;
  }

  return {
    key: toDocumentUid(document),
    type: DOCUMENT_PALETTE_ENTRY_TYPE.FRAGMENT,
    title: document.title,
    subtitle: getSubtitle(document),
    target: document,
  };
}
