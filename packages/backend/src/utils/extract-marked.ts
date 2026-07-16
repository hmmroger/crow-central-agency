import type { ZodType } from "zod";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

/** Extract the payload a single-pass agent wrapped between its sentinel markers */
export function extractMarked(raw: string, beginMarker: string, endMarker: string): string {
  const beginIndex = raw.indexOf(beginMarker);
  const endIndex = raw.lastIndexOf(endMarker);
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    throw new AppError("Missing sentinel markers in agent response", APP_ERROR_CODES.VALIDATION);
  }

  return raw.slice(beginIndex + beginMarker.length, endIndex).trim();
}

/**
 * Extract marked JSON from a raw response and validate it against a Zod schema, returning the typed
 * model. Throws when the markers are missing, the payload is not valid JSON, or it fails the schema.
 */
export function extractMarkedJson<TModel>(
  raw: string,
  schema: ZodType<TModel>,
  beginMarker: string,
  endMarker: string
): TModel {
  const text = extractMarked(raw, beginMarker, endMarker);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("Marked agent response is not valid JSON", APP_ERROR_CODES.VALIDATION);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AppError("Marked agent response failed validation", APP_ERROR_CODES.VALIDATION);
  }

  return result.data;
}
