import { ZodError } from "zod";
import { AppError } from "../error/app-error.js";
import { APP_ERROR_CODES } from "../error/app-error.types.js";

/** Wrap ZodError into AppError for consistent error responses */
export function wrapZodError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new AppError("Invalid input", APP_ERROR_CODES.VALIDATION);
  }

  throw error;
}
