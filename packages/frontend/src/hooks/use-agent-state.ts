import { useCallback, useContext, useSyncExternalStore } from "react";
import { AgentStatesContext } from "../providers/agent-states-provider.js";
import type { AgentStateEntry } from "../providers/agent-states-provider.types.js";

export function useAgentState(agentId: string): AgentStateEntry | undefined {
  const context = useContext(AgentStatesContext);
  if (!context) {
    throw new Error("useAgentState must be used within an AgentStatesProvider");
  }

  const { subscribe, getAgentState } = context;
  const getSnapshot = useCallback(() => getAgentState(agentId), [getAgentState, agentId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
