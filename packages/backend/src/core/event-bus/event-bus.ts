import type { EventMap, EventListener } from "./event-bus.types.js";
import { EventEmitterAsyncResource } from "events";

/**
 * Generic typed event bus. Services extend this to emit and listen for events.
 */
export class EventBus<TEvents extends EventMap> {
  private listeners = new Map<keyof TEvents, Map<EventListener<unknown>, EventListener<unknown>>>();
  private emitter: EventEmitterAsyncResource;

  constructor() {
    this.emitter = new EventEmitterAsyncResource({ name: "main" });
  }

  /** Subscribe to an event */
  public on<K extends string & keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Map();
      this.listeners.set(event, eventListeners);
    }

    if (eventListeners.has(listener as EventListener<unknown>)) {
      return;
    }

    const wrapperListener: EventListener<TEvents[K]> = (payload) => {
      setImmediate(() => {
        listener(payload);
      });
    };

    eventListeners.set(listener as EventListener<unknown>, wrapperListener as EventListener<unknown>);

    this.emitter.on(event, wrapperListener);
  }

  /** Unsubscribe from an event */
  public off<K extends string & keyof TEvents>(event: K, listener: EventListener<TEvents[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      return;
    }

    const wrapperListener = eventListeners.get(listener as EventListener<unknown>);
    if (!wrapperListener) {
      return;
    }

    this.emitter.off(event, wrapperListener);
    eventListeners.delete(listener as EventListener<unknown>);
  }

  /** Emit an event to all subscribed listeners */
  protected emit<K extends string & keyof TEvents>(event: K, payload: TEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Remove all listeners for a specific event, or all events if no event specified */
  public removeAllListeners<K extends string & keyof TEvents>(event?: K): void {
    const eventsToRemove = event ? [event] : ([...this.listeners.keys()] as K[]);

    for (const eventKey of eventsToRemove) {
      const eventListeners = this.listeners.get(eventKey);
      if (!eventListeners) {
        continue;
      }

      for (const [originalListener] of eventListeners) {
        this.off(eventKey, originalListener as EventListener<TEvents[K]>);
      }
    }
  }
}
