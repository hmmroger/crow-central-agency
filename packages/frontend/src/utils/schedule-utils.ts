import type { Schedule } from "@crow-central-agency/shared";

/** Label for an agent id in a schedule that resolves to no agent, e.g. after the agent was deleted */
export const UNKNOWN_AGENT_LABEL = "Unknown agent";

/** Enabled schedules first, then alphabetical within each group */
export function compareSchedules(scheduleA: Schedule, scheduleB: Schedule): number {
  if (scheduleA.enabled !== scheduleB.enabled) {
    return scheduleA.enabled ? -1 : 1;
  }

  return scheduleA.name.localeCompare(scheduleB.name);
}

/** The schedules that fan out to a given agent, in the same order the Schedules view uses */
export function selectSchedulesForAgent(schedules: Schedule[], agentId: string): Schedule[] {
  return schedules.filter((schedule) => schedule.agentIds.includes(agentId)).sort(compareSchedules);
}
