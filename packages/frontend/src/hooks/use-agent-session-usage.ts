import { useCallback, useContext, useSyncExternalStore } from "react";
import type { SessionUsage } from "@crow-central-agency/shared";
import { AgentStatesContext } from "../providers/agent-states-provider.js";

/**
 * Subscribe to a single agent's session usage.
 * Returns undefined before hydration completes or if the agent is unknown.
 */
export function useAgentSessionUsage(agentId: string): SessionUsage | undefined {
  const context = useContext(AgentStatesContext);
  if (!context) {
    throw new Error("useAgentSessionUsage must be used within an AgentStatesProvider");
  }

  const { subscribe, getAgentSessionUsage } = context;
  const getSnapshot = useCallback(() => getAgentSessionUsage(agentId), [getAgentSessionUsage, agentId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
