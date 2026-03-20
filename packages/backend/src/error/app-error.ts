import type { AppErrorCode } from "./app-error.types.js";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly errorCode: AppErrorCode
  ) {
    super(message);
    this.name = "AppError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
