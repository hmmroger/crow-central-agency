import type { MessageSource } from "@crow-central-agency/shared";

export { MESSAGE_SOURCE_TYPE, type MessageSourceType, type MessageSource } from "@crow-central-agency/shared";

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
