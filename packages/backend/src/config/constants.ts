/**
 * Application-level constants
 */

/** Default permission timeout in milliseconds (2 minutes) */
export const PERMISSION_TIMEOUT_MS = 2 * 60 * 1000;

/** WebSocket heartbeat interval in milliseconds */
export const WS_HEARTBEAT_INTERVAL_MS = 30 * 1000;

/** Text coalescer flush delay in milliseconds */
export const TEXT_COALESCE_FLUSH_DELAY_MS = 50;

/** Artifact timestamp window for inter-agent validation (5 minutes) */
export const ARTIFACT_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
