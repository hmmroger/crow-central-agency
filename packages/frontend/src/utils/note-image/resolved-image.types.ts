import type { NoteFileMetadata } from "@crow-central-agency/shared";

export const RESOLVED_IMAGE_KIND = {
  NOTE: "note",
  URL: "url",
  MISSING: "missing",
} as const;

export type ResolvedImage =
  | { kind: typeof RESOLVED_IMAGE_KIND.NOTE; note: NoteFileMetadata }
  | { kind: typeof RESOLVED_IMAGE_KIND.URL; url: string; alt: string }
  | { kind: typeof RESOLVED_IMAGE_KIND.MISSING; target: string };
