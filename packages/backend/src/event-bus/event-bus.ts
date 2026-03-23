import type { EventMap, EventListener } from "./event-bus.types.js";

/**
 * Generic typed event bus. Services extend this to emit and listen for events.
 *
 * @example
 * ```ts
 * interface MyEvents extends EventMap {
 *   itemCreated: { id: string };
 *   itemDeleted: { id: string };
 * }
 * class MyService extends EventBus<MyEvents> { ... }
 * ```
 */
export class EventBus<TEvents extends EventMap> {
  private listeners = new Map<keyof TEvents, Set<EventListener<unknown>>>();

  /** Subscribe to an event */
  on<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event);
    eventListeners?.add(listener as EventListener<unknown>);
  }

  /** Unsubscribe from an event */
  off<K extends keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
    this.listeners.get(event)?.delete(listener as EventListener<unknown>);
  }

  /** Emit an event to all subscribed listeners */
  protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener(payload);
      }
    }
  }

  /** Remove all listeners for a specific event, or all events if no event specified */
  removeAllListeners(event?: keyof TEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
