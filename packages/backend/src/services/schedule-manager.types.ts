import type { Schedule } from "@crow-central-agency/shared";
import type { EventMap } from "../core/event-bus/event-bus.types.js";

/** Events emitted by the ScheduleManager */
export interface ScheduleManagerEvents extends EventMap {
  /** A schedule reached its firing condition — listeners create the resulting tasks */
  scheduleFired: { schedule: Schedule };
  /** A schedule's configuration changed through an edit or agent-deletion pruning */
  scheduleUpdated: { schedule: Schedule };
}

/** Options controlling how a schedule fire is evaluated */
export interface FireScheduleOptions {
  /** Fire even when the schedule is disabled — used by the manual run path */
  ignoreEnabled?: boolean;
}
