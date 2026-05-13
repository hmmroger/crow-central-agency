import path from "node:path";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";

const MAX_FILENAME_CHARS = 255;
const MAX_COLLISION_COUNTER = 9999;

const ALLOWED_CHAR_PATTERN = /[^\p{L}\p{N}._-]/gu;
const COLLAPSE_UNDERSCORES_PATTERN = /_+/g;
const LEADING_STRIP_PATTERN = /^[._]+/;
const TRAILING_STRIP_PATTERN = /[._]+$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

function avoidWindowsReservedName(filename: string): string {
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  if (WINDOWS_RESERVED_NAME_PATTERN.test(base)) {
    return `${base}_${ext}`;
  }

  return filename;
}

/**
 * Normalize an artifact filename deterministically and idempotently.
 *
 * @throws AppError(INVALID_FILENAME) when input collapses to an empty or
 *         unusable filename (e.g. "@#$" or pure punctuation), or when the
 *         normalized result exceeds the length cap.
 */
export function normalizeArtifactFilename(input: string): string {
  let result = input.normalize();
  result = result.toLowerCase();
  result = result.normalize();
  result = result.replace(ALLOWED_CHAR_PATTERN, "_");
  result = result.replace(COLLAPSE_UNDERSCORES_PATTERN, "_");
  result = result.replace(LEADING_STRIP_PATTERN, "").replace(TRAILING_STRIP_PATTERN, "");
  result = avoidWindowsReservedName(result);

  if (Array.from(result).length > MAX_FILENAME_CHARS) {
    throw new AppError(
      `Artifact filename exceeds ${MAX_FILENAME_CHARS} characters: "${input}"`,
      APP_ERROR_CODES.INVALID_FILENAME
    );
  }

  if (!result || result === "." || result === "..") {
    throw new AppError(`Invalid artifact filename: "${input}"`, APP_ERROR_CODES.INVALID_FILENAME);
  }

  return result;
}

/** Normalize a filename, swallowing INVALID_FILENAME errors (return undefined). */
export function safeNormalizeArtifactFilename(input: string): string | undefined {
  try {
    return normalizeArtifactFilename(input);
  } catch {
    return undefined;
  }
}

/**
 * Return `filename` if it is not in `taken`, otherwise append `_<n>` to its
 * base name (preserving extension) and increment until a non-colliding name
 * within the length cap is found. Returns undefined when no suffix can fit.
 * Used during legacy artifact migration to disambiguate filenames that
 * collide after normalization without dropping any entry.
 */
export function pickAvailableFilename(filename: string, taken: Set<string>): string | undefined {
  if (!taken.has(filename)) {
    return filename;
  }

  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  for (let counter = 1; counter <= MAX_COLLISION_COUNTER; counter += 1) {
    const candidate = `${base}_${counter}${ext}`;
    if (Array.from(candidate).length > MAX_FILENAME_CHARS) {
      return undefined;
    }

    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
