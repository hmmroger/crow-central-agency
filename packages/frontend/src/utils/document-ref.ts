import { DOCUMENT_REF_KIND, type DocumentRef } from "./document-ref.types.js";

export function isSameDocumentRef(refA: DocumentRef, refB: DocumentRef): boolean {
  switch (refA.kind) {
    case DOCUMENT_REF_KIND.NOTE:
      return refB.kind === DOCUMENT_REF_KIND.NOTE && refA.noteId === refB.noteId;

    case DOCUMENT_REF_KIND.ARTIFACT:
      return (
        refB.kind === DOCUMENT_REF_KIND.ARTIFACT &&
        refA.ownerType === refB.ownerType &&
        refA.ownerId === refB.ownerId &&
        refA.filename === refB.filename
      );
  }
}
