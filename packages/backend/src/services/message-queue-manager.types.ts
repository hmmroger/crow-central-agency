/** Source type identifiers for queued messages */
export const MESSAGE_SOURCE_TYPE = {
  USER: "USER",
  LOOP: "LOOP",
  AGENT: "AGENT",
  TASK: "TASK",
  RECOVERY: "RECOVERY",
  NOTIFICATION: "NOTIFICATION",
} as const;
export type MessageSourceType = (typeof MESSAGE_SOURCE_TYPE)[keyof typeof MESSAGE_SOURCE_TYPE];

/** Composite source - identifies who originated a queued message */
export type MessageSource =
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.USER }
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.LOOP }
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.AGENT; agentId: string }
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.TASK; taskId: string }
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.RECOVERY }
  | { sourceType: typeof MESSAGE_SOURCE_TYPE.NOTIFICATION };

/** A single queued message waiting for an agent to become idle */
export interface QueuedMessage {
  /** Unique ID for this queue entry */
  id: string;
  /** The message text to send */
  message: string;
  /** When the message was enqueued (ISO 8601) */
  enqueuedAt: string;
  /** Origin of the message */
  source: MessageSource;
}
