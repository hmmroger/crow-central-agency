import type { SchedulerTime, TimeModeType } from "@crow-central-agency/shared";
import type { EventMap } from "../core/event-bus/event-bus.types.js";

/** A scheduled reminder for an agent */
export interface AgentReminder {
  /** Unique identifier for this reminder */
  id: string;
  /** The agent this reminder belongs to */
  agentId: string;
  /** The reminder text to deliver */
  text: string;
  /** Timestamp (epoch ms) when the reminder should fire */
  remindAt: number;
}

/** Callback invoked when scheduled work fires */
export type ScheduledWorkCallback = (scheduleId: string) => void | Promise<void>;

/** A registered scheduled work entry */
export interface ScheduledWork {
  id: string;
  timeMode: TimeModeType;
  times: SchedulerTime[];
  callback: ScheduledWorkCallback;
}

/** Events emitted by the CrowScheduler */
export interface CrowSchedulerEvents extends EventMap {
  loopTick: { agentId: string; prompt: string };
  reminderFired: { reminder: AgentReminder };
}
