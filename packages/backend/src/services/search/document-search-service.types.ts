export const DATA_SOURCE_TYPE = {
  ARTIFACT: "artifact",
  CIRCLE_ARTIFACT: "circleArtifact",
  TASK: "task",
  FRAGMENT: "fragment",
} as const;
export type DataSourceType = (typeof DATA_SOURCE_TYPE)[keyof typeof DATA_SOURCE_TYPE];

/**
 * Provenance for documents that share one global pool instead of belonging to an agent or
 * circle container. A task uses this: its id is already globally unique, and its owner is an
 * assignee rather than a container, so there is no per-container provenance to record.
 */
export const GLOBAL_PROVENANCE_ID = "global";

/**
 * A document to index. A `documentId` is unique only within its (`dataSourceType`,
 * `provenanceId`) pair. `provenanceId` is the container the document belongs to: the owner
 * agentId for an artifact, the circleId for a circleArtifact, and `GLOBAL_PROVENANCE_ID` for a
 * task.
 */
export interface SearchDocument {
  documentId: string;
  dataSourceType: DataSourceType;
  provenanceId: string;
  title: string;
  text: string;
  tags?: string[];
}

/** Identity and provenance of an indexed document, used for removal and access filtering. */
export interface DocumentRef {
  documentId: string;
  dataSourceType: DataSourceType;
  provenanceId: string;
}

/** Decides whether a matched document is visible to the caller. */
export type DocumentSearchFilter = (ref: DocumentRef) => boolean;

export interface DocumentSearchOptions {
  filter?: DocumentSearchFilter;
  limit?: number;
}

export interface DocumentSearchHit {
  documentId: string;
  dataSourceType: DataSourceType;
  provenanceId: string;
  title: string;
  tags?: string[];
  score: number;
}
