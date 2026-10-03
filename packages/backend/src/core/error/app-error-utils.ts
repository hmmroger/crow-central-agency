import { AppError } from "./app-error.js";
import type { AppErrorCode } from "./app-error.types.js";

export function isAppErrorCode(error: unknown, errorCode: AppErrorCode): error is AppError {
  return error instanceof AppError && error.errorCode === errorCode;
}
