/**
 * App error codes
 */
export const AppErrorCodes = {
  Unknown: "Unknown",
} as const;

export type AppErrorCode = (typeof AppErrorCodes)[keyof typeof AppErrorCodes];
