import type { EventMap } from "../event-bus/event-bus.types.js";

/** Events emitted by the WsBroadcaster */
export interface WsBroadcasterEvents extends EventMap {
  clientConnected: { clientId: string };
  clientDisconnected: { clientId: string };
}
