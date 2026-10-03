import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

/** Type guard for Node.js filesystem errors with an error code */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Expand a leading `~` to the user's home directory; otherwise resolve to an absolute path. */
export function expandPath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }

  return path.resolve(filePath);
}

/**
 * Resolve symlinks to the real location. Falls back to the given path when it cannot be resolved
 * (a missing file), so the caller still reports against the path that was asked for.
 */
export async function resolveRealPath(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal attacks.
 */
export function assertWithinBase(filePath: string, baseDir: string): void {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new AppError(`Path traversal detected`, APP_ERROR_CODES.PATH_TRAVERSAL);
  }
}

function assertResolvedWithinBase(resolved: string, resolvedBase: string): void {
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new AppError(`Path traversal detected`, APP_ERROR_CODES.PATH_TRAVERSAL);
  }
}

/**
 * Validate that a path is within the allowed base directory after symlinks are
 * resolved — `assertWithinBase` only normalizes the string, so a symlink inside
 * the base that points outside it passes that check but reads/writes elsewhere.
 * A target that does not exist yet is validated through its parent's real path.
 *
 * @throws AppError(NOT_FOUND) when the target's parent directory does not exist.
 * @throws AppError(PATH_TRAVERSAL) when the real path escapes the base.
 */
export async function assertRealPathWithinBase(targetPath: string, baseDir: string): Promise<void> {
  const resolvedBase = await fs.realpath(baseDir);

  let resolvedTarget: string | undefined;
  try {
    resolvedTarget = await fs.realpath(targetPath);
  } catch (error) {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (resolvedTarget !== undefined) {
    assertResolvedWithinBase(resolvedTarget, resolvedBase);
    return;
  }

  const parentPath = path.dirname(targetPath);
  let resolvedParent: string;
  try {
    resolvedParent = await fs.realpath(parentPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`Directory not found: ${parentPath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  }

  assertResolvedWithinBase(path.resolve(resolvedParent, path.basename(targetPath)), resolvedBase);
}

/**
 * Read a JSON file and parse its contents.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`File not found: ${filePath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  }
}

/**
 * Write an object as JSON to a file.
 * Creates parent directories if they don't exist.
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(data, undefined, 2), { encoding: "utf-8", mode: 0o600 });
}

/**
 * Read a text file.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`File not found: ${filePath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  }
}

/**
 * Write text content to a file.
 * Creates parent directories if they don't exist.
 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
}

/**
 * Read a binary file as a Buffer.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function readBinaryFile(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`File not found: ${filePath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  }
}

/**
 * Write binary content to a file.
 * Creates parent directories if they don't exist.
 */
export async function writeBinaryFile(filePath: string, content: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, content, { mode: 0o600 });
}

/**
 * Create a file with binary content only if nothing exists at the path; the
 * parent directory must exist. Returns false when the path is already taken.
 */
export async function createBinaryFile(filePath: string, content: Buffer): Promise<boolean> {
  try {
    await fs.writeFile(filePath, content, { mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

/**
 * Read the first N bytes of a file. Returns fewer bytes if the file is smaller.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function readFileHead(filePath: string, bytes: number): Promise<Buffer> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);

    return bytesRead < bytes ? buffer.subarray(0, bytesRead) : buffer;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`File not found: ${filePath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * Get file stats.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function statFile(filePath: string): Promise<Stats> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AppError(`File not found: ${filePath}`, APP_ERROR_CODES.NOT_FOUND);
    }

    throw error;
  }
}

/** Stats of a path, or undefined when it does not exist. Symlinks are not followed. */
export async function getPathStats(filePath: string): Promise<Stats | undefined> {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export async function isPathExists(filePath: string): Promise<boolean> {
  try {
    await statFile(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true, mode: 0o700 });
}

/**
 * List file names in a directory (non-recursive, files only).
 * Returns an empty array if the directory does not exist.
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

/**
 * Delete a file. Does not throw if the file does not exist.
 */
export async function deleteFile(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch((error) => {
    if (!isErrnoException(error) || error.code !== "ENOENT") {
      throw error;
    }
  });
}

/**
 * Rename a file. Returns true on success, false if the source did not exist.
 * @throws AppError(PATH_TRAVERSAL) is the responsibility of the caller via
 *         assertWithinBase; this helper itself does not validate paths.
 */
export async function renameFile(oldPath: string, newPath: string): Promise<boolean> {
  try {
    await fs.rename(oldPath, newPath);
    return true;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

/**
 * Move `sourcePath` onto `targetPath`, merging directories instead of replacing
 * them: intermediate directories are created, a directory is merged entry by
 * entry into an existing one, and a file overwrites whatever is in its way.
 * The source is gone when this resolves.
 */
export async function mergeMove(sourcePath: string, targetPath: string): Promise<void> {
  // Neither side follows symlinks: a link is moved as the link it is, never
  // descended into, so the walk cannot leave the tree it was handed.
  const sourceStats = await getPathStats(sourcePath);
  if (sourceStats === undefined) {
    throw new AppError(`File not found: ${sourcePath}`, APP_ERROR_CODES.NOT_FOUND);
  }

  const targetStats = await getPathStats(targetPath);

  if (!sourceStats.isDirectory()) {
    if (targetStats?.isDirectory()) {
      await removeDir(targetPath);
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    await fs.rename(sourcePath, targetPath);

    return;
  }

  if (targetStats !== undefined && !targetStats.isDirectory()) {
    await deleteFile(targetPath);
  }

  await fs.mkdir(targetPath, { recursive: true, mode: 0o700 });

  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    await mergeMove(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
  }

  await fs.rmdir(sourcePath);
}

/**
 * Remove a directory and its contents recursively.
 * Does not throw if the directory does not exist (force: true handles ENOENT).
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

/**
 * Walk up from `startDir` toward `basePath`, removing each directory that is
 * empty. Stops at the first non-empty directory or when reaching `basePath`.
 * `basePath` itself is never removed. A missing directory (ENOENT) does not
 * stop the walk — the next ancestor is still considered.
 */
export async function removeEmptyAncestors(startDir: string, basePath: string): Promise<void> {
  const resolvedBase = path.resolve(basePath);
  let current = path.resolve(startDir);

  while (current !== resolvedBase && current.startsWith(resolvedBase + path.sep)) {
    try {
      await fs.rmdir(current);
    } catch (error) {
      if (isErrnoException(error)) {
        if (error.code === "ENOTEMPTY") {
          return;
        }

        if (error.code === "ENOENT") {
          current = path.dirname(current);
          continue;
        }
      }

      throw error;
    }

    current = path.dirname(current);
  }
}
