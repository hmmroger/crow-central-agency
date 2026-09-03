import { AGENT_TASK_SOURCE_TYPE, type AgentConfig, type AgentTaskSource } from "@crow-central-agency/shared";

export interface TaskSourceLookup {
  agents: AgentConfig[];
  scheduleNames: ReadonlyMap<string, string>;
}

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
    // A pre-schedules task has no scheduleId, and a schedule can be deleted while its tasks remain.
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
