import type { NoteFileMetadata } from "@crow-central-agency/shared";

/** Content of a single note: a string for text notes, raw bytes otherwise. */
export interface ReadNoteResult {
  metadata: NoteFileMetadata;
  content: string | Buffer;
}
