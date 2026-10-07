import type { NoteFileMetadata, NoteMetadata } from "@crow-central-agency/shared";

/** A note that a wikilink target matches. */
export interface WikilinkMatch {
  note: NoteMetadata;
  /** The target's folder segments reach the notes root, so it named the full path */
  isRootAnchored: boolean;
}

/** Where the note an unresolved target names is created: `missingFolderNames` are made in order under `parentId`. */
export interface WikilinkPlacement {
  parentId?: string;
  missingFolderNames: string[];
  noteName: string;
}

export interface WikilinkSuggestionMatch {
  note: NoteFileMetadata;
  /** The name (or path) starts with the query, which ranks it first */
  isPrefix: boolean;
}
