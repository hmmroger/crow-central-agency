import { useCallback, useContext, useSyncExternalStore } from "react";
import { AgentStatesContext } from "../providers/agent-states-provider.js";
import type { AgentStateEntry } from "../providers/agent-states-provider.types.js";

/**
 * Subscribe to a single agent's runtime state (without session usage).
 * Returns undefined before hydration completes or if the agent is unknown.
 */
export function useAgentState(agentId: string): AgentStateEntry | undefined {
  const context = useContext(AgentStatesContext);
  if (!context) {
    throw new Error("useAgentState must be used within an AgentStatesProvider");
  }

  const { subscribe, getAgentState } = context;
  const getSnapshot = useCallback(() => getAgentState(agentId), [getAgentState, agentId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
