import type { NoteFileMetadata } from "@crow-central-agency/shared";

/** Loads a note image, resolving to an object URL the cache then owns, or `undefined` when the note is not binary. */
export type LoadNoteImageUrl = (note: NoteFileMetadata) => Promise<string | undefined>;

export interface NoteImageCacheEntry {
  users: number;
  url: Promise<string | undefined>;
}
