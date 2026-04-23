/**
 * Generic object store interfaces.
 *
 * These interfaces are intentionally free of storage-specific concepts
 * (file paths, databases, etc.) so the backing implementation can be
 * swapped without changing consuming code.
 *
 * All operations are async to support remote database backends.
 */

/**
 * Metadata wrapper around each stored value.
 * Tracks versioning and timestamps for each entry.
 */
export interface StoreEntry<T> {
  /** The stored value */
  value: T;
  /** Data model schema version — set by the provider, not auto-incremented */
  version: number;
  /** Epoch ms when the entry was first created */
  createdAt: number;
  /** Epoch ms when the entry was last updated */
  updatedAt: number;
}

/** Supported query comparison operators */
export const STORE_QUERY_OPERATORS = {
  EQ: "EQ",
  NE: "NE",
  GT: "GT",
  GE: "GE",
  LT: "LT",
  LE: "LE",
} as const;

export type StoreQueryOperator = (typeof STORE_QUERY_OPERATORS)[keyof typeof STORE_QUERY_OPERATORS];

/** Primitive types that support comparison */
export type StoreComparableValue = string | number | boolean;

/** A single query condition that checks a field against a value */
export interface StoreQueryCondition<T extends Record<string, unknown>> {
  field: keyof T & string;
  operator: StoreQueryOperator;
  value: StoreComparableValue;
}

/**
 * Generic key-value object store.
 *
 * Every operation takes a `table` name to identify the data collection.
 * All operations are async to support both local and remote backends.
 * Concurrency guarantees vary by implementation — consult the provider's
 * documentation for write-serialization behavior.
 */
export interface ObjectStoreProvider {
  /**
   * Get an entry by table and key, or undefined if not found.
   * Returns undefined if the table does not exist.
   */
  get<T>(table: string, key: string): Promise<StoreEntry<T> | undefined>;

  /** Check if an entry exists in a table */
  has(table: string, key: string): Promise<boolean>;

  /** Get all entries in a table as an array */
  getAll<T>(table: string): Promise<StoreEntry<T>[]>;

  /** Get the number of entries in a table */
  size(table: string): Promise<number>;

  /**
   * Set a value by table and key. Wraps in StoreEntry with metadata.
   * - New key: createdAt = now, updatedAt = now
   * - Existing key: updates updatedAt, preserves createdAt
   * @returns The created or updated StoreEntry
   */
  set<T>(table: string, key: string, value: T): Promise<StoreEntry<T>>;

  /**
   * Delete an entry by table and key.
   * @returns true if the entry existed and was deleted, false otherwise
   */
  delete(table: string, key: string): Promise<boolean>;

  /** Delete all entries in a table */
  clear(table: string): Promise<void>;

  /**
   * Delete all entries in a table AND remove its backing storage
   * (file for file-backed providers, directory for folder-backed providers).
   * After this call the table is fully gone from disk; the next access will
   * lazily recreate it via the usual initialization path.
   */
  dropTable(table: string): Promise<void>;

  /**
   * Get multiple entries by table and keys.
   * Returns a Map of key to StoreEntry for found entries. Missing keys are omitted.
   */
  getMany<T>(table: string, keys: string[]): Promise<Map<string, StoreEntry<T>>>;

  /**
   * Set multiple entries atomically (single persist for file-backed stores).
   * Each entry follows the same timestamp logic as set().
   * If the same key appears more than once, later occurrences are treated
   * as updates to the earlier ones within the same batch.
   * @returns Map of key to created/updated StoreEntry
   */
  setMany<T>(table: string, entries: ReadonlyArray<readonly [string, T]>): Promise<Map<string, StoreEntry<T>>>;

  /**
   * Query entries in a table by matching conditions against object properties.
   * All conditions must be satisfied (AND logic).
   * @returns Map of key to StoreEntry for matching entries
   */
  query<T extends Record<string, unknown>>(
    table: string,
    conditions: StoreQueryCondition<T>[]
  ): Promise<Map<string, StoreEntry<T>>>;
}
