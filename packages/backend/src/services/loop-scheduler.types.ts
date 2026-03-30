import type { EventMap } from "../event-bus/event-bus.types.js";

/** Events emitted by the LoopScheduler */
export interface LoopSchedulerEvents extends EventMap {
  loopTick: { agentId: string; prompt: string; taskId: string };
}
