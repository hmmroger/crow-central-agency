import { AGENT_ACTIVITY_TYPE, type AgentActivity } from "@crow-central-agency/shared";

/**
 * Compose a short one-line summary suitable for the at-a-glance row.
 */
export function getActivitySummary(activity: AgentActivity): string {
  switch (activity.type) {
    case AGENT_ACTIVITY_TYPE.QUERYSTART:
      return "New query started";
    case AGENT_ACTIVITY_TYPE.GENERAL:
      return `${activity.activity}: ${activity.description}`;
    case AGENT_ACTIVITY_TYPE.TOOLUSE:
      return activity.description ? `${activity.toolName} - ${activity.description}` : activity.toolName;
  }
}

/**
 * True when the activity has meaningful detail content beyond its summary row.
 * Used to decide whether to render the expand chevron.
 */
export function hasActivityDetails(activity: AgentActivity): boolean {
  if (activity.type === AGENT_ACTIVITY_TYPE.QUERYSTART) {
    return false;
  }

  if (activity.type === AGENT_ACTIVITY_TYPE.TOOLUSE) {
    return activity.input !== undefined || activity.subAgentId !== undefined;
  }

  return activity.subAgentId !== undefined;
}
