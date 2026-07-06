import type { FeedItem } from "./simply-feed.types.js";

/** Flattened, searchable projection of a FeedItem fed to MiniSearch. */
export interface FeedSearchDocument {
  id: string;
  feedId: string;
  title: string;
  description: string;
  summary: string;
  topics: string[];
  categories: string[];
  author: string;
}

/** A ranked search hit: item id plus its owning feed and blended score. */
export interface ScoredFeedDocument {
  id: string;
  feedId: string;
  score: number;
}

/**
 * Persisted index payload. `optionsFingerprint` guards against loading an
 * index built with incompatible options — a mismatch forces a full rebuild.
 */
export interface PersistedSearchIndex {
  optionsFingerprint: string;
  serializedIndex: string;
}

/** Loads every item across every feed from the store for a full rebuild. */
export type FeedItemLoader = () => Promise<FeedItem[]>;
