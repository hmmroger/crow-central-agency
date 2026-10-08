import type { DataSourceType } from "@crow-central-agency/shared";

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

/** Change callbacks a `SearchSource` reports through; the search service decides what to do with them. */
export interface SearchSourceListener {
  /** An item was added or changed. */
  onDocumentUpdate(document: SearchDocument): void;
  /** An item was deleted or is no longer indexable. */
  onDocumentRemove(ref: DocumentRef): void;
}

/**
 * Adapter that produces documents from one data source; it never acts on the index. Each
 * `DataSourceType` is produced by exactly one registered source.
 */
export interface SearchSource {
  readonly dataSourceTypes: readonly DataSourceType[];
  /** Yields every existing document for the startup index build; failed documents are logged and skipped. */
  loadAll(): AsyncIterable<SearchDocument>;
  /** Attaches to the source's change events and reports them to the listener. */
  subscribe(listener: SearchSourceListener): void;
}
