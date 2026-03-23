/**
 * Permission modes matching SDK PermissionMode type.
 * Controls how tool permissions are handled during agent execution.
 */
export const PERMISSION_MODE = {
  DEFAULT: "default",
  ACCEPT_EDITS: "acceptEdits",
  BYPASS_PERMISSIONS: "bypassPermissions",
  PLAN: "plan",
  DONT_ASK: "dontAsk",
} as const;

export type PermissionMode = (typeof PERMISSION_MODE)[keyof typeof PERMISSION_MODE];
