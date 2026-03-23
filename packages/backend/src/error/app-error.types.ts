/**
 * App error codes — internal to CCA, no HTTP status.
 * Route handlers map these to appropriate HTTP status codes.
 */
export const AppErrorCodes = {
  Unknown: "unknown",
  NotFound: "not_found",
  Validation: "validation",
  AgentNotFound: "agent_not_found",
  AgentBusy: "agent_busy",
  AgentNotRunning: "agent_not_running",
  SessionNotFound: "session_not_found",
  PermissionTimeout: "permission_timeout",
  PermissionDenied: "permission_denied",
  ArtifactNotFound: "artifact_not_found",
  PathTraversal: "path_traversal",
  McpError: "mcp_error",
  SdkError: "sdk_error",
  WsError: "ws_error",
} as const;

export type AppErrorCode = (typeof AppErrorCodes)[keyof typeof AppErrorCodes];
