import { ZodError } from "zod";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";

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
