import type { NoteFileMetadata } from "@crow-central-agency/shared";

export interface WikilinkSuggestionMatch {
  note: NoteFileMetadata;
  /** The name (or path) starts with the query, which ranks it first */
  isPrefix: boolean;
}

export interface WikilinkSuggestionQuery {
  /** The unescaped text typed after `[[` */
  query: string;
  /** `![[` suggests image notes only */
  isEmbed: boolean;
  /** Never suggested, since a note does not link to itself */
  currentNoteId?: string;
}
