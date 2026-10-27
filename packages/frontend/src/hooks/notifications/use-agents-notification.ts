import { useCallback, useMemo, useSyncExternalStore } from "react";
import { AGENT_STATUS } from "@crow-central-agency/shared";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useAgentStatesContext } from "../../providers/agent-states-provider.js";
import { NAV_NOTIFICATION_KIND, type NavNotification } from "../../providers/notifications-provider.types.js";

/** Agents nav notification: count of listed agents whose status is not idle */
export function useAgentsNotification(): NavNotification | undefined {
  const { agents } = useAgentsContext();
  const { subscribe, getAgentState } = useAgentStatesContext();

  const getActiveCount = useCallback(
    () =>
      agents.filter((agent) => {
        const status = getAgentState(agent.id)?.status;

        return status !== undefined && status !== AGENT_STATUS.IDLE;
      }).length,
    [agents, getAgentState]
  );
  const count = useSyncExternalStore(subscribe, getActiveCount);

  return useMemo(
    () => ({
      kind: NAV_NOTIFICATION_KIND.COUNT,
      count,
      description: `${count} active ${count === 1 ? "agent" : "agents"}`,
    }),
    [count]
  );
}
