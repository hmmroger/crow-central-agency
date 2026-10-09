import type { ArtifactEntityType } from "@crow-central-agency/shared";

export const DOCUMENT_REF_KIND = {
  NOTE: "note",
  ARTIFACT: "artifact",
} as const;

export interface NoteDocumentRef {
  kind: typeof DOCUMENT_REF_KIND.NOTE;
  noteId: string;
}

export interface ArtifactDocumentRef {
  kind: typeof DOCUMENT_REF_KIND.ARTIFACT;
  ownerType: ArtifactEntityType;
  ownerId: string;
  filename: string;
}

/** A note or artifact the user can open, identified the way search hits and list routes identify it */
export type DocumentRef = NoteDocumentRef | ArtifactDocumentRef;
