/**
 * Application-level constants
 */

export const LLM_PROVIDER_TYPE = {
  ANTHROPIC: "ANTHROPIC",
  GOOGLE: "GOOGLE",
  OPENAI: "OPENAI",
  CUSTOM: "CUSTOM",
} as const;

/** Default permission timeout in milliseconds (2 minutes) */
export const PERMISSION_TIMEOUT_MS = 2 * 60 * 1000;

/** WebSocket heartbeat interval in milliseconds */
export const WS_HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Artifact timestamp window for inter-agent validation (5 minutes) */
export const ARTIFACT_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** Default message sent to the agent when a tool permission is denied without a typed response */
export const DEFAULT_PERMISSION_DENY_MESSAGE = "Permission denied by user";

/** Subdirectory name under CROW_SYSTEM_PATH for per-agent folders */
export const AGENTS_DIR_NAME = "agents";

/** Subdirectory name under CROW_SYSTEM_PATH for per-circle folders */
export const CIRCLES_DIR_NAME = "circles";

/** Subdirectory name under each agent's folder for artifact files */
export const AGENT_ARTIFACTS_DIR_NAME = "artifacts";

/** Filename for the per-agent instruction file */
export const AGENT_MD_FILENAME = "AGENT.md";

/** Filename for the per-agent message queue */
export const MESSAGE_QUEUE_FILENAME = "message-queue.json";

/** Subdirectory name under CROW_SYSTEM_PATH for the system agents' project */
export const SYSTEM_AGENTS_PROJECT_DIR_NAME = "system-project";

/** Default workspace directory for agents without an explicit workspace */
export const DEFAULT_PROJECT_DIR_NAME = "default-project";

/** Object store table name for agent reminders */
export const REMINDERS_STORE_TABLE = "reminders";

export const CLIENT_STORE_TABLE = "client";
export const CLIENT_STORE_TIMEZONE_KEY = "timezone";
export const CLIENT_STORE_LOCATION_KEY = "location";
