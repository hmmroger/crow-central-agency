import MiniSearch from "minisearch";
import { logger } from "../../utils/logger.js";
import type {
  DataSourceType,
  DocumentRef,
  DocumentSearchHit,
  DocumentSearchOptions,
  SearchDocument,
  SearchIndexSink,
  SearchSource,
} from "./document-search-service.types.js";

/** Internal shape stored in MiniSearch: a SearchDocument plus the composite key and joined tag text. */
interface IndexedDocument extends SearchDocument {
  uid: string;
  tagText: string;
}

const SEARCHABLE_FIELDS = ["title", "text", "tagText"];
const STORED_FIELDS = ["documentId", "dataSourceType", "provenanceId", "title", "tags"];

/** Field boosts: a title hit outweighs a tag hit, which outweighs a body hit. */
const FIELD_BOOST = { title: 4, tagText: 2 };

/** Max edit distance as a fraction of term length — tolerates typos and minor variations. */
const FUZZY_DISTANCE = 0.2;

const log = logger.child({ context: "document-search-service" });

/**
 * In-memory full-text search over workspace documents, backed by MiniSearch. Documents come from
 * registered `SearchSource` adapters: on `initialize` each source is subscribed to its change
 * events and its existing documents are indexed. `search` ranks matches with prefix and fuzzy
 * matching, filtered to what the caller is allowed to see.
 */
export class DocumentSearchService {
  private readonly index: MiniSearch<IndexedDocument>;
  private readonly sources: SearchSource[] = [];
  private readonly claimedTypes = new Set<DataSourceType>();
  private readonly sink: SearchIndexSink = {
    upsert: (document) => this.upsertDocument(document),
    remove: (ref) => this.removeDocument(ref),
  };

  constructor() {
    this.index = new MiniSearch<IndexedDocument>({
      idField: "uid",
      fields: SEARCHABLE_FIELDS,
      storeFields: STORED_FIELDS,
      searchOptions: {
        boost: FIELD_BOOST,
        fuzzy: FUZZY_DISTANCE,
        prefix: true,
      },
    });
  }

  public registerSource(source: SearchSource): void {
    const claimed = source.dataSourceTypes.find((dataSourceType) => this.claimedTypes.has(dataSourceType));
    if (claimed) {
      throw new Error(`Search data source type "${claimed}" is already registered`);
    }

    for (const dataSourceType of source.dataSourceTypes) {
      this.claimedTypes.add(dataSourceType);
    }

    this.sources.push(source);
  }

  public async initialize(): Promise<void> {
    for (const source of this.sources) {
      source.subscribe(this.sink);
      await this.loadSource(source);
    }
  }

  public search(query: string, options?: DocumentSearchOptions): DocumentSearchHit[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const filter = options?.filter;
    const results = this.index.search(trimmedQuery, {
      filter: filter
        ? (result) =>
            filter({
              documentId: result.documentId,
              dataSourceType: result.dataSourceType,
              provenanceId: result.provenanceId,
            })
        : undefined,
    });

    const limited = options?.limit !== undefined ? results.slice(0, options.limit) : results;
    return limited.map((result) => ({
      documentId: result.documentId,
      dataSourceType: result.dataSourceType,
      provenanceId: result.provenanceId,
      title: result.title,
      tags: result.tags?.length ? result.tags : undefined,
      score: result.score,
    }));
  }

  private async loadSource(source: SearchSource): Promise<void> {
    try {
      for await (const document of source.loadAll()) {
        this.upsertDocument(document);
      }
    } catch (error) {
      log.error({ error, dataSourceTypes: source.dataSourceTypes }, "Failed to load search source");
    }
  }

  private upsertDocument(document: SearchDocument): void {
    const indexed = this.toIndexedDocument(document);
    if (this.index.has(indexed.uid)) {
      this.index.replace(indexed);
    } else {
      this.index.add(indexed);
    }
  }

  private removeDocument(ref: DocumentRef): void {
    const uid = this.toUid(ref);
    if (this.index.has(uid)) {
      this.index.discard(uid);
    }
  }

  /** Identity is the (dataSourceType, provenanceId, documentId) triple, since documentIds (e.g. artifact filenames) repeat across containers. */
  private toUid(ref: DocumentRef): string {
    return `${ref.dataSourceType}:${ref.provenanceId}:${ref.documentId}`;
  }

  private toIndexedDocument(document: SearchDocument): IndexedDocument {
    return {
      ...document,
      uid: this.toUid(document),
      tagText: document.tags?.join(" ") ?? "",
    };
  }
}
