import type { DocumentRef } from "./document-search-service.types.js";

/** Identity is the (dataSourceType, provenanceId, documentId) triple, since documentIds (e.g. artifact filenames) repeat across containers. */
export function toDocumentUid(ref: DocumentRef): string {
  return `${ref.dataSourceType}:${ref.provenanceId}:${ref.documentId}`;
}
