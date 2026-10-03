import type { NoteMetadata } from "@crow-central-agency/shared";

/** A note from a resolve answer, an image URL, or nothing, which draws the missing chip */
export type ImageContent = NoteMetadata | string | undefined;
