/**
 * App error codes — internal to CCA, no HTTP status.
 * Route handlers map these to appropriate HTTP status codes.
 */
export const APP_ERROR_CODES = {
  UNKNOWN: "unknown",
  NOT_FOUND: "not_found",
  VALIDATION: "validation",
  AGENT_NOT_FOUND: "agent_not_found",
  AGENT_BUSY: "agent_busy",
  AGENT_NOT_RUNNING: "agent_not_running",
  SESSION_NOT_FOUND: "session_not_found",
  PERMISSION_TIMEOUT: "permission_timeout",
  PERMISSION_DENIED: "permission_denied",
  ARTIFACT_NOT_FOUND: "artifact_not_found",
  PATH_TRAVERSAL: "path_traversal",
  MCP_ERROR: "mcp_error",
  SDK_ERROR: "sdk_error",
  WS_ERROR: "ws_error",
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];
