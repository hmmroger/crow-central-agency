import type { Schedule } from "@crow-central-agency/shared";

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
