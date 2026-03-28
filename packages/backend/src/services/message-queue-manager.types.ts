/** Source of a queued message — for observability and debugging */
export const MESSAGE_SOURCE = {
  USER: "USER",
  LOOP: "LOOP",
  INTER_AGENT: "INTER_AGENT",
  RECOVERY: "RECOVERY",
  NOTIFICATION: "NOTIFICATION",
} as const;

export type MessageSource = (typeof MESSAGE_SOURCE)[keyof typeof MESSAGE_SOURCE];

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
