import type { DataSourceType, DocumentRef } from "@crow-central-agency/shared";

/** A document to index, identified by its `DocumentRef` fields. */
export interface SearchDocument extends DocumentRef {
  title: string;
  text: string;
  tags?: string[];
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
