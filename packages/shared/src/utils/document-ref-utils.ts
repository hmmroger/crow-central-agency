import { ENTITY_TYPE } from "../schemas/agent-circle.schema.js";
import type { ArtifactMetadata } from "../schemas/artifact.schema.js";
import { DATA_SOURCE_TYPE, type DocumentRef } from "../schemas/search.schema.js";

/** Identity is the (dataSourceType, provenanceId, documentId) triple, since documentIds (e.g. artifact filenames) repeat across containers. */
export function toDocumentUid(ref: DocumentRef): string {
  return `${ref.dataSourceType}:${ref.provenanceId}:${ref.documentId}`;
}

export function toArtifactDocumentRef({
  entityType,
  entityId,
  filename,
}: Pick<ArtifactMetadata, "entityType" | "entityId" | "filename">): DocumentRef {
  return {
    documentId: filename,
    dataSourceType:
      entityType === ENTITY_TYPE.AGENT_CIRCLE ? DATA_SOURCE_TYPE.CIRCLE_ARTIFACT : DATA_SOURCE_TYPE.ARTIFACT,
    provenanceId: entityId,
  };
}
