/**
 * App error codes - internal to CCA, no HTTP status.
 * Route handlers map these to appropriate HTTP status codes.
 */
export const APP_ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  UNKNOWN: "unknown",
  NOT_FOUND: "not_found",
  NOT_SUPPORTED: "not_supported",
  VALIDATION: "validation",
  AGENT_NOT_FOUND: "agent_not_found",
  AGENT_IMMUTABLE: "agent_immutable",
  AGENT_NOT_RUNNING: "agent_not_running",
  SESSION_NOT_FOUND: "session_not_found",
  PERMISSION_TIMEOUT: "permission_timeout",
  PERMISSION_DENIED: "permission_denied",
  TASK_NOT_FOUND: "task_not_found",
  INVALID_STATE_TRANSITION: "invalid_state_transition",
  PATH_TRAVERSAL: "path_traversal",
  MCP_CONFIG_NOT_FOUND: "mcp_config_not_found",
  MCP_ERROR: "mcp_error",
  SDK_ERROR: "sdk_error",
  WS_ERROR: "ws_error",
  CIRCLE_NOT_FOUND: "circle_not_found",
  RELATIONSHIP_NOT_FOUND: "relationship_not_found",
  DUPLICATE_RELATIONSHIP: "duplicate_relationship",
  CIRCLE_IMMUTABLE: "circle_immutable",
  CIRCULAR_MEMBERSHIP: "circular_membership",
  LAST_CIRCLE_MEMBERSHIP: "last_circle_membership",
  TEXT_GEN_PROVIDER_ERROR: "text_gen_provider_error",
  FEED_ERROR: "feed_error",
  FEED_FETCH_ERROR: "feed_fetch_error",
  FEED_INVALID: "feed_invalid",
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];
