import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, undefined, 2), "utf-8");
}

/**
 * Read a text file.
 * @throws AppError with NOT_FOUND code if the file does not exist.
 */
export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Ensure a directory exists, creating it if necessary.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Remove a directory and its contents recursively.
 * Does not throw if the directory does not exist (force: true handles ENOENT).
 */
export async function removeDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}
