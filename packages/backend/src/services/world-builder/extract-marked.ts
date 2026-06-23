import type { ZodType } from "zod";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { WORLD_BUILDER_BEGIN, WORLD_BUILDER_END } from "./world-builder.constants.js";

export function extractMarked(raw: string): string {
  const beginIndex = raw.indexOf(WORLD_BUILDER_BEGIN);
  const endIndex = raw.lastIndexOf(WORLD_BUILDER_END);
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    throw new AppError("Missing world builder sentinel markers", APP_ERROR_CODES.VALIDATION);
  }

  return raw.slice(beginIndex + WORLD_BUILDER_BEGIN.length, endIndex).trim();
}

/**
 * Extract marked JSON from a raw response and validate it against a Zod schema, returning the typed
 * model. Throws when the markers are missing, the payload is not valid JSON, or it fails the schema.
 */
export function extractMarkedJson<TModel>(raw: string, schema: ZodType<TModel>): TModel {
  const text = extractMarked(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("World Builder returned invalid JSON", APP_ERROR_CODES.VALIDATION);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("World Builder response failed validation", APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}
