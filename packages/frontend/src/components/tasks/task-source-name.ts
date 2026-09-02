import { AGENT_TASK_SOURCE_TYPE, type AgentConfig, type AgentTaskSource } from "@crow-central-agency/shared";

/** Backend-provided data a task source is resolved to a display name against */
export interface TaskSourceLookup {
  agents: AgentConfig[];
  scheduleNames: ReadonlyMap<string, string>;
}

/** Resolve an agent ID to display name, falling back to truncated ID */
function resolveAgentName(agents: AgentConfig[], agentId: string): string {
  const agent = agents.find((agentItem) => agentItem.id === agentId);
  return agent?.name ?? agentId.slice(0, 8);
}

/** Resolve display name from a task source using discriminant narrowing */
export function resolveTaskSourceName(source: AgentTaskSource, lookup: TaskSourceLookup): string {
  if (source.sourceType === AGENT_TASK_SOURCE_TYPE.AGENT) {
    return resolveAgentName(lookup.agents, source.agentId);
  }

  switch (source.sourceType) {
    // Tasks predating top-level schedules carry no scheduleId, and a schedule can be deleted
    // after the tasks it produced — both fall back to the bare label.
    case AGENT_TASK_SOURCE_TYPE.LOOP: {
      const scheduleName = source.scheduleId ? lookup.scheduleNames.get(source.scheduleId) : undefined;
      return scheduleName ? `Schedule · ${scheduleName}` : "Schedule";
    }

    case AGENT_TASK_SOURCE_TYPE.REMINDER:
      return "Reminder";

    case AGENT_TASK_SOURCE_TYPE.SYSTEM:
      return "System";

    case AGENT_TASK_SOURCE_TYPE.USER:
      return "User";
  }
}
