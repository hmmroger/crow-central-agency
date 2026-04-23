/**
 * Folder-file object store provider.
 *
 * Each key maps to an individual JSON file under `{basePath}/{table}/{key}.json`.
 * No in-memory caching — every read goes directly to disk. Suited for
 * large or infrequently accessed data where memory footprint matters.
 */

import path from "node:path";
import { logger } from "../../utils/logger.js";
import {
  readJsonFile,
  writeJsonFile,
  assertWithinBase,
  ensureDir,
  listFiles,
  deleteFile,
  removeDir,
  statFile,
} from "../../utils/fs-utils.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";
import { AppError } from "../error/app-error.js";
import type { ObjectStoreProvider, StoreEntry, StoreQueryCondition } from "./object-store.types.js";
import { isValidStoreEntry } from "./store-entry-utils.js";

const log = logger.child({ context: "folder-file-store" });

const FOLDER_FILE_ENTRY_VERSION = 1;
const JSON_EXT = ".json";

/**
 * Folder-file implementation of ObjectStoreProvider.
 *
 * Each table name maps to a directory at `{basePath}/{table}/`.
 * Each key maps to an individual file at `{basePath}/{table}/{key}.json`.
 * All reads go directly to disk — there is no in-memory cache.
 *
 * Writes are NOT serialized. Concurrent writes to the same key may result
 * in a lost update (e.g. stale createdAt). Callers are responsible for
 * coordinating concurrent access to the same key if needed.
 */
export class FolderFileStoreProvider implements ObjectStoreProvider {
  /** Tracks which table directories have been created */
  private initializedTables = new Set<string>();

  /**
   * @param basePath - Base directory for store folders (e.g. the CROW_SYSTEM_PATH)
   */
  constructor(private readonly basePath: string) {}

  public async get<T>(table: string, key: string): Promise<StoreEntry<T> | undefined> {
    const filePath = await this.resolveKeyPath(table, key);
    return this.readKeyFile<T>(filePath);
  }

  public async has(table: string, key: string): Promise<boolean> {
    const filePath = await this.resolveKeyPath(table, key);
    return this.fileExists(filePath);
  }

  public async getAll<T>(table: string): Promise<StoreEntry<T>[]> {
    const dirPath = await this.resolveTableDir(table);
    const files = await listFiles(dirPath);
    const jsonFiles = files.filter((file) => file.endsWith(JSON_EXT));
    const entries = await Promise.all(
      jsonFiles.map((file) => {
        const filePath = path.join(dirPath, file);
        assertWithinBase(filePath, dirPath);
        return this.readKeyFile<T>(filePath);
      })
    );

    return entries.filter((entry): entry is StoreEntry<T> => entry !== undefined);
  }

  public async query<T extends Record<string, unknown>>(
    _table: string,
    _conditions: StoreQueryCondition<T>[]
  ): Promise<Map<string, StoreEntry<T>>> {
    throw new AppError("query is not supported by FolderFileStoreProvider", APP_ERROR_CODES.NOT_SUPPORTED);
  }

  public async size(table: string): Promise<number> {
    const dirPath = await this.resolveTableDir(table);
    const files = await listFiles(dirPath);
    return files.filter((file) => file.endsWith(JSON_EXT)).length;
  }

  public async set<T>(table: string, key: string, value: T): Promise<StoreEntry<T>> {
    const filePath = await this.resolveKeyPath(table, key);
    const existing = await this.readKeyFile(filePath);
    const entry = this.buildEntry(value, existing);
    await writeJsonFile(filePath, entry);
    return entry;
  }

  public async delete(table: string, key: string): Promise<boolean> {
    const filePath = await this.resolveKeyPath(table, key);
    const existed = await this.fileExists(filePath);
    if (existed) {
      await deleteFile(filePath);
    }

    return existed;
  }

  public async clear(table: string): Promise<void> {
    const dirPath = await this.resolveTableDir(table);
    const files = await listFiles(dirPath);
    const jsonFiles = files.filter((file) => file.endsWith(JSON_EXT));
    await Promise.all(
      jsonFiles.map((file) => {
        const filePath = path.join(dirPath, file);
        assertWithinBase(filePath, dirPath);

        return deleteFile(filePath);
      })
    );
  }

  public async dropTable(table: string): Promise<void> {
    const dirPath = path.join(this.basePath, table);
    assertWithinBase(dirPath, this.basePath);
    await removeDir(dirPath);
    this.initializedTables.delete(table);
  }

  public async getMany<T>(table: string, keys: string[]): Promise<Map<string, StoreEntry<T>>> {
    const dirPath = await this.resolveTableDir(table);
    const result = new Map<string, StoreEntry<T>>();

    await Promise.all(
      keys.map(async (key) => {
        const filePath = this.keyFilePath(dirPath, key);
        const entry = await this.readKeyFile<T>(filePath);
        if (entry) {
          result.set(key, entry);
        }
      })
    );

    return result;
  }

  public async setMany<T>(
    table: string,
    entries: ReadonlyArray<readonly [string, T]>
  ): Promise<Map<string, StoreEntry<T>>> {
    const dirPath = await this.resolveTableDir(table);
    const result = new Map<string, StoreEntry<T>>();

    for (const [key, value] of entries) {
      const filePath = this.keyFilePath(dirPath, key);
      const existing = await this.readKeyFile(filePath);
      const entry = this.buildEntry(value, existing);
      result.set(key, entry);
    }

    await Promise.all(
      Array.from(result.entries()).map(([key, entry]) => writeJsonFile(this.keyFilePath(dirPath, key), entry))
    );

    return result;
  }

  /** Build a StoreEntry with timestamp logic */
  private buildEntry<T>(value: T, existing: StoreEntry<unknown> | undefined): StoreEntry<T> {
    const now = Date.now();
    return {
      value,
      version: FOLDER_FILE_ENTRY_VERSION,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
  }

  /** Resolve the table directory path and ensure it exists on first access */
  private async resolveTableDir(table: string): Promise<string> {
    const dirPath = path.join(this.basePath, table);
    assertWithinBase(dirPath, this.basePath);

    if (!this.initializedTables.has(table)) {
      await ensureDir(dirPath);
      this.initializedTables.add(table);
    }

    return dirPath;
  }

  /** Resolve the full file path for a key, ensuring the table directory exists */
  private async resolveKeyPath(table: string, key: string): Promise<string> {
    const dirPath = await this.resolveTableDir(table);

    return this.keyFilePath(dirPath, key);
  }

  /** Compute the file path for a key within a table directory */
  private keyFilePath(dirPath: string, key: string): string {
    const filePath = path.join(dirPath, `${key}${JSON_EXT}`);
    assertWithinBase(filePath, dirPath);
    return filePath;
  }

  /** Check if a file exists on disk without reading its contents */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await statFile(filePath);
      return true;
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        return false;
      }

      throw error;
    }
  }

  /** Read a single key file from disk, returning undefined if not found or invalid */
  private async readKeyFile<T>(filePath: string): Promise<StoreEntry<T> | undefined> {
    try {
      const entry = await readJsonFile<StoreEntry<T>>(filePath);
      if (isValidStoreEntry(entry)) {
        return entry;
      }

      log.warn({ filePath }, "Invalid store entry file, ignoring");

      return undefined;
    } catch (error) {
      if (error instanceof AppError && error.errorCode === APP_ERROR_CODES.NOT_FOUND) {
        return undefined;
      }

      throw error;
    }
  }
}
