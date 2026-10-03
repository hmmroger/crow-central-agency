import type { ApiError } from "../services/api-client.types.js";

const FALLBACK_ERROR_MESSAGE = "An error occurred";

function isApiError(error: unknown): error is ApiError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return "code" in error && typeof error.code === "string" && "message" in error && typeof error.message === "string";
}

/**
 * Message for an unknown thrown value. `unwrapResponse` rejects with a plain
 * `ApiError` object rather than an `Error`, so both shapes are handled.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (isApiError(error)) {
    return error.message;
  }

  return FALLBACK_ERROR_MESSAGE;
}
