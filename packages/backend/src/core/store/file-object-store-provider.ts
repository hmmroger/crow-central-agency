/**
 * File-based object store provider.
 *
 * Each table maps to a JSON file under the configured base path.
 * Tables are backed by an in-memory Map for fast reads, with
 * serialized async writes to disk. Tables are lazily initialized
 * on first access.
 */

import path from "node:path";
import { logger } from "../../utils/logger.js";
import { readJsonFile, writeJsonFile, assertWithinBase, deleteFile } from "../../utils/fs-utils.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { AppError } from "../error/app-error.js";
import {
  STORE_QUERY_OPERATORS,
  type ObjectStoreProvider,
  type StoreComparableValue,
  type StoreEntry,
  type StoreQueryCondition,
} from "./object-store.types.js";
import { isValidStoreEntry } from "./store-entry-utils.js";

const FILE_STORE_ENTRY_VERSION = 1;
const log = logger.child({ context: "object-store" });

/** Persisted file format for a store table */
interface FileEnvelope<T> {
  entries: Record<string, StoreEntry<T>>;
}

/** Internal per-table state */
interface TableState {
  data: Map<string, StoreEntry<unknown>>;
  filePath: string;
  opChain: Promise<void>;
}

/**
 * File-based implementation of ObjectStoreProvider.
 *
 * Each table name maps to a JSON file at `{basePath}/{table}.json`.
 * Tables are lazily initialized on first access and cached in memory.
 */
export class FileObjectStoreProvider implements ObjectStoreProvider {
  private tables = new Map<string, TableState>();
  private initPromises = new Map<string, Promise<void>>();

  /**
   * @param basePath - Base directory for store files (e.g. the CROW_SYSTEM_PATH)
   */
  constructor(private readonly basePath: string) {}

  public async get<T>(table: string, key: string): Promise<StoreEntry<T> | undefined> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return state.data.get(key) as StoreEntry<T> | undefined;
  }

  public async has(table: string, key: string): Promise<boolean> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return state.data.has(key);
  }

  public async getAll<T>(table: string): Promise<StoreEntry<T>[]> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return Array.from(state.data.values()) as StoreEntry<T>[];
  }

  public async size(table: string): Promise<number> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return state.data.size;
  }

  public async set<T>(table: string, key: string, value: T): Promise<StoreEntry<T>> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return this.serializedWithResult(state, async () => {
      const entry = this.buildEntry(state, key, value);
      state.data.set(key, entry as StoreEntry<unknown>);
      await this.persistTable(state);

      return entry;
    });
  }

  public async delete(table: string, key: string): Promise<boolean> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return this.serializedWithResult(state, async () => {
      const existed = state.data.delete(key);
      if (existed) {
        await this.persistTable(state);
      }

      return existed;
    });
  }

  public async clear(table: string): Promise<void> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    await this.serializedWithResult(state, async () => {
      state.data.clear();
      await this.persistTable(state);
    });
  }

  public async dropTable(table: string): Promise<void> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    await this.serializedWithResult(state, async () => {
      state.data.clear();
      await deleteFile(state.filePath);
      this.tables.delete(table);
    });
  }

  public async getMany<T>(table: string, keys: string[]): Promise<Map<string, StoreEntry<T>>> {
    await this.ensureTable(table);
    const state = this.getTableState(table);
    const result = new Map<string, StoreEntry<T>>();

    for (const key of keys) {
      const entry = state.data.get(key);
      if (entry) {
        result.set(key, entry as StoreEntry<T>);
      }
    }

    return result;
  }

  public async setMany<T>(
    table: string,
    entries: ReadonlyArray<readonly [string, T]>
  ): Promise<Map<string, StoreEntry<T>>> {
    await this.ensureTable(table);
    const state = this.getTableState(table);

    return this.serializedWithResult(state, async () => {
      const result = new Map<string, StoreEntry<T>>();

      for (const [key, value] of entries) {
        const entry = this.buildEntry(state, key, value);
        state.data.set(key, entry as StoreEntry<unknown>);
        result.set(key, entry);
      }

      await this.persistTable(state);

      return result;
    });
  }

  public async query<T extends Record<string, unknown>>(
    table: string,
    conditions: StoreQueryCondition<T>[]
  ): Promise<Map<string, StoreEntry<T>>> {
    await this.ensureTable(table);
    const state = this.getTableState(table);
    const result = new Map<string, StoreEntry<T>>();

    for (const [key, entry] of state.data) {
      const typedEntry = entry as StoreEntry<T>;
      if (matchesAllConditions(typedEntry.value, conditions)) {
        result.set(key, typedEntry);
      }
    }

    return result;
  }

  /** Build a StoreEntry with timestamp logic */
  private buildEntry<T>(state: TableState, key: string, value: T): StoreEntry<T> {
    const now = Date.now();
    const existing = state.data.get(key);

    return {
      value,
      version: FILE_STORE_ENTRY_VERSION,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
  }

  /** Ensure a table is loaded from disk into memory */
  private async ensureTable(table: string): Promise<void> {
    if (this.tables.has(table)) {
      return;
    }

    // Deduplicate concurrent init calls for the same table
    const existing = this.initPromises.get(table);
    if (existing) {
      return existing;
    }

    const initPromise = this.loadTable(table);
    this.initPromises.set(table, initPromise);

    try {
      await initPromise;
    } finally {
      this.initPromises.delete(table);
    }
  }

  /** Load a table from its JSON file into memory */
  private async loadTable(table: string): Promise<void> {
    const filePath = path.join(this.basePath, `${table}.json`);
    assertWithinBase(filePath, this.basePath);

    const state: TableState = {
      data: new Map(),
      filePath,
      opChain: Promise.resolve(),
    };

    try {
      const raw = await readJsonFile<FileEnvelope<unknown>>(filePath);
      if (
        raw &&
        typeof raw === "object" &&
        "entries" in raw &&
        typeof raw.entries === "object" &&
        raw.entries !== null
      ) {
        for (const [key, entry] of Object.entries(raw.entries)) {
          if (isValidStoreEntry(entry)) {
            state.data.set(key, entry);
          } else {
            log.warn({ table, key }, "Skipping invalid store entry");
          }
        }
      }

      log.info({ table, count: state.data.size }, "Store table loaded");
    } catch (error) {
      // Non-fatal: start with an empty table rather than crashing.
      // this.tables.set below is always reached.
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        log.info({ table }, "Store file not found, starting empty");
      } else {
        log.warn({ table, error }, "Failed to load store table, starting empty");
      }
    }

    this.tables.set(table, state);
  }

  /** Get table state, throwing if not initialized */
  private getTableState(table: string): TableState {
    const state = this.tables.get(table);
    if (!state) {
      throw new Error(`Table "${table}" not initialized. This should not happen after ensureTable().`);
    }

    return state;
  }

  /** Persist a table's in-memory state to its JSON file */
  private async persistTable(state: TableState): Promise<void> {
    const envelope: FileEnvelope<unknown> = {
      entries: Object.fromEntries(state.data),
    };

    await writeJsonFile(state.filePath, envelope);
  }

  /** Serialize an async operation per table via its Promise chain */
  private async serializedWithResult<R>(state: TableState, operation: () => Promise<R>): Promise<R> {
    const next: Promise<R> = state.opChain.catch(() => undefined).then(operation);
    state.opChain = next.then(
      () => undefined,
      () => undefined
    );

    return next;
  }
}

/** Check if a value matches all query conditions */
function matchesAllConditions<T extends Record<string, unknown>>(
  value: T,
  conditions: StoreQueryCondition<T>[]
): boolean {
  return conditions.every((condition) => {
    const fieldValue = value[condition.field];

    return compareValues(fieldValue, condition.operator, condition.value);
  });
}

/** Compare a field value against a condition value using the given operator */
function compareValues(fieldValue: unknown, operator: string, conditionValue: StoreComparableValue): boolean {
  switch (operator) {
    case STORE_QUERY_OPERATORS.EQ:
      return fieldValue === conditionValue;
    case STORE_QUERY_OPERATORS.NE:
      return fieldValue !== conditionValue;
    default:
      return compareOrdered(fieldValue, conditionValue, operator);
  }
}

/** Handle ordered comparisons (gt, ge, lt, le) — requires matching types */
function compareOrdered(fieldValue: unknown, conditionValue: StoreComparableValue, operator: string): boolean {
  if (typeof fieldValue === "number" && typeof conditionValue === "number") {
    switch (operator) {
      case STORE_QUERY_OPERATORS.GT:
        return fieldValue > conditionValue;
      case STORE_QUERY_OPERATORS.GE:
        return fieldValue >= conditionValue;
      case STORE_QUERY_OPERATORS.LT:
        return fieldValue < conditionValue;
      case STORE_QUERY_OPERATORS.LE:
        return fieldValue <= conditionValue;
    }
  }

  if (typeof fieldValue === "string" && typeof conditionValue === "string") {
    switch (operator) {
      case STORE_QUERY_OPERATORS.GT:
        return fieldValue > conditionValue;
      case STORE_QUERY_OPERATORS.GE:
        return fieldValue >= conditionValue;
      case STORE_QUERY_OPERATORS.LT:
        return fieldValue < conditionValue;
      case STORE_QUERY_OPERATORS.LE:
        return fieldValue <= conditionValue;
    }
  }

  return false;
}
