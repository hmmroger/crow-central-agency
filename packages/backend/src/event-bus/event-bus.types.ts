/**
 * Generic event map type - maps event names to their payload types.
 * Services define their own event maps extending this pattern.
 */
export type EventMap = Record<string, unknown>;

/** Listener function for a specific event */
export type EventListener<T> = (payload: T) => void;
