import {
  STORE_QUERY_OPERATORS,
  type ObjectStoreProvider,
  type StoreComparableValue,
  type StoreEntry,
  type StoreQueryCondition,
} from "./object-store.types.js";

const STORE_ENTRY_VERSION = 1;

/**
 * In-memory ObjectStoreProvider for tests. Mirrors FileObjectStoreProvider
 * semantics without touching disk. Casts at the generic storage boundary
 * follow the same pattern as the file-backed provider.
 */
export class InMemoryObjectStore implements ObjectStoreProvider {
  private readonly tables = new Map<string, Map<string, StoreEntry<unknown>>>();

  public async get<T>(table: string, key: string): Promise<StoreEntry<T> | undefined> {
    return this.tables.get(table)?.get(key) as StoreEntry<T> | undefined;
  }

  public async has(table: string, key: string): Promise<boolean> {
    return this.tables.get(table)?.has(key) ?? false;
  }

  public async getAll<T>(table: string): Promise<StoreEntry<T>[]> {
    const entries = this.tables.get(table);

    return entries ? (Array.from(entries.values()) as StoreEntry<T>[]) : [];
  }

  public async size(table: string): Promise<number> {
    return this.tables.get(table)?.size ?? 0;
  }

  public async set<T>(table: string, key: string, value: T): Promise<StoreEntry<T>> {
    const entry = this.buildEntry(table, key, value);
    this.getTable(table).set(key, entry as StoreEntry<unknown>);

    return entry;
  }

  public async delete(table: string, key: string): Promise<boolean> {
    return this.tables.get(table)?.delete(key) ?? false;
  }

  public async clear(table: string): Promise<void> {
    this.tables.get(table)?.clear();
  }

  public async dropTable(table: string): Promise<void> {
    this.tables.delete(table);
  }

  public async getMany<T>(table: string, keys: string[]): Promise<Map<string, StoreEntry<T>>> {
    const entries = this.tables.get(table);
    const result = new Map<string, StoreEntry<T>>();
    if (!entries) {
      return result;
    }

    for (const key of keys) {
      const entry = entries.get(key);
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
    const result = new Map<string, StoreEntry<T>>();
    for (const [key, value] of entries) {
      const entry = this.buildEntry(table, key, value);
      this.getTable(table).set(key, entry as StoreEntry<unknown>);
      result.set(key, entry);
    }

    return result;
  }

  public async query<T extends Record<string, unknown>>(
    table: string,
    conditions: StoreQueryCondition<T>[]
  ): Promise<Map<string, StoreEntry<T>>> {
    const entries = this.tables.get(table);
    const result = new Map<string, StoreEntry<T>>();
    if (!entries) {
      return result;
    }

    for (const [key, entry] of entries) {
      const typedEntry = entry as StoreEntry<T>;
      if (matchesAllConditions(typedEntry.value, conditions)) {
        result.set(key, typedEntry);
      }
    }

    return result;
  }

  private getTable(table: string): Map<string, StoreEntry<unknown>> {
    let entries = this.tables.get(table);
    if (!entries) {
      entries = new Map();
      this.tables.set(table, entries);
    }

    return entries;
  }

  private buildEntry<T>(table: string, key: string, value: T): StoreEntry<T> {
    const now = Date.now();
    const existing = this.tables.get(table)?.get(key);

    return {
      value,
      version: STORE_ENTRY_VERSION,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
  }
}

function matchesAllConditions<T extends Record<string, unknown>>(
  value: T,
  conditions: StoreQueryCondition<T>[]
): boolean {
  return conditions.every((condition) => compareValues(value[condition.field], condition.operator, condition.value));
}

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

function compareOrdered(fieldValue: unknown, conditionValue: StoreComparableValue, operator: string): boolean {
  if (typeof fieldValue === "number" && typeof conditionValue === "number") {
    return applyOrderedOperator(fieldValue, conditionValue, operator);
  }

  if (typeof fieldValue === "string" && typeof conditionValue === "string") {
    return applyOrderedOperator(fieldValue, conditionValue, operator);
  }

  return false;
}

function applyOrderedOperator<T extends number | string>(fieldValue: T, conditionValue: T, operator: string): boolean {
  switch (operator) {
    case STORE_QUERY_OPERATORS.GT:
      return fieldValue > conditionValue;
    case STORE_QUERY_OPERATORS.GE:
      return fieldValue >= conditionValue;
    case STORE_QUERY_OPERATORS.LT:
      return fieldValue < conditionValue;
    case STORE_QUERY_OPERATORS.LE:
      return fieldValue <= conditionValue;
    default:
      return false;
  }
}
