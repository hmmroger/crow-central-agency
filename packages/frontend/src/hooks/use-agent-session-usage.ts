import { useCallback, useContext, useSyncExternalStore } from "react";
import type { SessionUsage } from "@crow-central-agency/shared";
import { AgentStatesContext } from "../providers/agent-states-provider.js";

export const DEFAULT_SESSION_USAGE: SessionUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  contextUsed: 0,
  contextTotal: 0,
};

export function useAgentSessionUsage(agentId: string): SessionUsage | undefined {
  const context = useContext(AgentStatesContext);
  if (!context) {
    throw new Error("useAgentSessionUsage must be used within an AgentStatesProvider");
  }

  const { subscribe, getAgentSessionUsage } = context;
  const getSnapshot = useCallback(() => getAgentSessionUsage(agentId), [getAgentSessionUsage, agentId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
