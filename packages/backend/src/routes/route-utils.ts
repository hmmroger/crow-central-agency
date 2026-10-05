import { ZodError } from "zod";
import type { ApiSuccess, DeletedResult } from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

/** Reply of the endpoints whose only result is that the entity is gone */
export function deletedResponse(): ApiSuccess<DeletedResult> {
  return { success: true, data: { deleted: true } };
}

/** Wrap ZodError into AppError for consistent error responses */
export function wrapZodError(error: unknown): never {
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => formatZodIssue(issue)).join("; ") || "Invalid input";
    throw new AppError(message, APP_ERROR_CODES.VALIDATION);
  }

  throw error;
}

function formatZodIssue(issue: ZodError["issues"][number]): string {
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
