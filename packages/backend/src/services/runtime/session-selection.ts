import { MESSAGE_SOURCE_TYPE, type MessageSource } from "../message-queue-manager.types.js";

/**
 * Whether this message asks to run in a fresh session instead of the agent's current one.
 * Answered from the source at the message's turn, so it holds however long the message was queued.
 */
export function requestsNewSession(source: MessageSource): boolean {
  return source.sourceType === MESSAGE_SOURCE_TYPE.TASK && source.newSession === true;
}
