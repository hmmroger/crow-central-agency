import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

/** Type guard for Node.js filesystem errors with an error code */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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
 * Remove a directory and its contents recursively.
 * Does not throw if the directory does not exist (force: true handles ENOENT).
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
