/**
 * Application-level constants
 */

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

/** Filename for the agents config file under CROW_SYSTEM_PATH */
export const AGENTS_CONFIG_FILENAME = "agents.json";

/** Filename for the orchestrator state file under CROW_SYSTEM_PATH */
export const ORCHESTRATOR_STATE_FILENAME = "orchestrator-state.json";

/** Filename for the orchestrator state backup created at startup */
export const ORCHESTRATOR_STATE_BACKUP_FILENAME = "orchestrator-state.backup.json";

/** Subdirectory name under each agent's folder for artifact files */
export const AGENT_ARTIFACTS_DIR_NAME = "artifacts";

/** Filename for the per-agent instruction file */
export const AGENT_MD_FILENAME = "AGENT.md";

/** Filename for the per-agent message queue */
export const MESSAGE_QUEUE_FILENAME = "message-queue.json";

/** Filename for the agent tasks database under CROW_SYSTEM_PATH */
export const AGENT_TASKS_FILENAME = "agent-tasks.json";
