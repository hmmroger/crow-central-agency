import MiniSearch, { type Options, type SearchOptions, type SearchResult } from "minisearch";
import type { FeedItem } from "./simply-feed.types.js";
import type {
  FeedItemLoader,
  FeedSearchDocument,
  PersistedSearchIndex,
  ScoredFeedDocument,
} from "./feed-search-index.types.js";
import type { ObjectStoreProvider } from "../core/store/object-store.types.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ context: "feed-search-index" });

export const SEARCH_INDEX_STORE_TABLE = "feeds/searchIndex";
export const SEARCH_INDEX_KEY = "global";

const INDEX_ID_FIELD = "id";
const INDEX_FIELDS = ["title", "subtitle", "description", "summary", "topics", "categories", "author"];
const INDEX_STORE_FIELDS = ["feedId"];

/**
 * Lexical-primary options for the raw user query. Prefix matching plus modest
 * fuzziness tolerate typos and partial words; title-first boosts keep exact
 * headline hits above body matches. IDF (BM25) ensures rare terms — such as a
 * person's name — rank at the top automatically.
 */
const RAW_SEARCH_OPTIONS: SearchOptions = {
  prefix: true,
  fuzzy: 0.2,
  boost: { title: 3, author: 2, summary: 1.5, topics: 1.2, description: 1, subtitle: 1, categories: 1 },
};

/**
 * Options for the LLM-expanded terms. Restricted to semantic fields and run
 * without prefix/fuzzy so expansion only adds recall; its contribution is
 * further scaled down by EXPANSION_SCORE_WEIGHT so it can never displace a
 * literal match.
 */
const EXPANSION_SEARCH_OPTIONS: SearchOptions = {
  fields: ["topics", "summary"],
  prefix: false,
  fuzzy: false,
};

const EXPANSION_SCORE_WEIGHT = 0.15;

/** Persist at most once per quiet window after the first pending change. */
const PERSIST_DEBOUNCE_MS = 5000;

function createMiniSearchOptions(): Options<FeedSearchDocument> {
  return {
    idField: INDEX_ID_FIELD,
    fields: INDEX_FIELDS,
    storeFields: INDEX_STORE_FIELDS,
  };
}

/**
 * A single global MiniSearch index over all feeds' items. A global (rather than
 * per-feed) index is required so IDF is corpus-relative across feeds, giving
 * correct cross-feed ranking. Only `id` and `feedId` are stored; the full
 * FeedItem is hydrated by id after ranking. The index is persisted to the
 * object store on a debounce and flushed on shutdown, never per item.
 */
export class FeedSearchIndex {
  private miniSearch: MiniSearch<FeedSearchDocument>;
  private readonly fingerprint: string;
  private dirty = false;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly indexStore: ObjectStoreProvider) {
    this.miniSearch = new MiniSearch<FeedSearchDocument>(createMiniSearchOptions());
    this.fingerprint = JSON.stringify(createMiniSearchOptions());
  }

  /**
   * Load the persisted index, or rebuild from all items when absent or when the
   * options fingerprint no longer matches. The rebuild is persisted so the next
   * boot loads cleanly.
   */
  public async initialize(loadAllItems: FeedItemLoader): Promise<void> {
    const persisted = await this.loadPersisted();
    if (persisted && persisted.optionsFingerprint === this.fingerprint) {
      try {
        this.miniSearch = await MiniSearch.loadJSONAsync<FeedSearchDocument>(
          persisted.serializedIndex,
          createMiniSearchOptions()
        );
        log.info({ documentCount: this.miniSearch.documentCount }, "Loaded persisted feed search index");
        return;
      } catch (error) {
        log.warn({ error }, "Failed to load persisted feed search index; rebuilding");
      }
    }

    await this.rebuild(loadAllItems);
  }

  /** Add new items or replace existing ones (same id) in the index. */
  public addOrReplace(items: FeedItem[]): void {
    if (items.length === 0) {
      return;
    }

    for (const item of items) {
      const document = this.toDocument(item);
      if (this.miniSearch.has(document.id)) {
        this.miniSearch.replace(document);
      } else {
        this.miniSearch.add(document);
      }
    }

    this.schedulePersist();
  }

  /** Remove items from the index by id (pruned or deleted items). */
  public discard(itemIds: string[]): void {
    const presentIds = itemIds.filter((id) => this.miniSearch.has(id));
    if (presentIds.length === 0) {
      return;
    }

    this.miniSearch.discardAll(presentIds);
    this.schedulePersist();
  }

  /**
   * Rank items for the raw query blended with low-weight expansion terms.
   * Results are scored on a single blended score (raw match + weighted
   * expansion), optionally filtered to the given feeds while IDF stays global.
   */
  public search(rawQuery: string, expansionTerms: string[], feedIds?: string[]): ScoredFeedDocument[] {
    const feedIdSet = feedIds ? new Set(feedIds) : undefined;
    const filter = feedIdSet ? (result: SearchResult) => feedIdSet.has(result.feedId) : undefined;

    const scores = new Map<string, ScoredFeedDocument>();

    const rawResults = this.miniSearch.search(rawQuery, { ...RAW_SEARCH_OPTIONS, filter });
    for (const result of rawResults) {
      scores.set(result.id, { id: result.id, feedId: result.feedId, score: result.score });
    }

    if (expansionTerms.length > 0) {
      const expansionResults = this.miniSearch.search(expansionTerms.join(" "), {
        ...EXPANSION_SEARCH_OPTIONS,
        filter,
      });
      for (const result of expansionResults) {
        const weighted = result.score * EXPANSION_SCORE_WEIGHT;
        const existing = scores.get(result.id);
        if (existing) {
          existing.score += weighted;
        } else {
          scores.set(result.id, { id: result.id, feedId: result.feedId, score: weighted });
        }
      }
    }

    return Array.from(scores.values()).sort((first, second) => second.score - first.score);
  }

  /** Persist any pending changes immediately and cancel the debounce timer. */
  public async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }

    if (this.dirty) {
      await this.persist();
    }
  }

  private async rebuild(loadAllItems: FeedItemLoader): Promise<void> {
    this.miniSearch = new MiniSearch<FeedSearchDocument>(createMiniSearchOptions());
    const items = await loadAllItems();
    await this.miniSearch.addAllAsync(items.map((item) => this.toDocument(item)));
    this.dirty = true;
    await this.persist();
    log.info({ documentCount: this.miniSearch.documentCount }, "Rebuilt feed search index");
  }

  private schedulePersist(): void {
    this.dirty = true;
    if (this.persistTimer) {
      return;
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persist();
    }, PERSIST_DEBOUNCE_MS);
    this.persistTimer.unref?.();
  }

  private async persist(): Promise<void> {
    let payload: PersistedSearchIndex;
    try {
      payload = {
        optionsFingerprint: this.fingerprint,
        serializedIndex: JSON.stringify(this.miniSearch),
      };
    } catch (error) {
      log.error({ error }, "Failed to serialize feed search index");
      return;
    }

    // Clear the dirty flag synchronously after serialization so changes that
    // arrive while the store write is in flight re-mark the index dirty and are
    // not lost by a concurrent flush or the next persist.
    this.dirty = false;
    try {
      await this.indexStore.set<PersistedSearchIndex>(SEARCH_INDEX_STORE_TABLE, SEARCH_INDEX_KEY, payload);
    } catch (error) {
      this.dirty = true;
      log.error({ error }, "Failed to persist feed search index");
    }
  }

  private async loadPersisted(): Promise<PersistedSearchIndex | undefined> {
    try {
      const entry = await this.indexStore.get<PersistedSearchIndex>(SEARCH_INDEX_STORE_TABLE, SEARCH_INDEX_KEY);
      return entry?.value;
    } catch (error) {
      log.warn({ error }, "Failed to read persisted feed search index");
      return undefined;
    }
  }

  private toDocument(item: FeedItem): FeedSearchDocument {
    return {
      id: item.id,
      feedId: item.feedId,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
      summary: item.summary ?? "",
      topics: item.topics ?? [],
      categories: item.categories ?? [],
      author: item.author ?? "",
    };
  }
}
