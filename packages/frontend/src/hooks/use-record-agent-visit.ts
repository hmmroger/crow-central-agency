import { useEffect } from "react";
import { useAppStore } from "../stores/app-store.js";

/**
 * Record that an agent console was shown, the single recording site for agent recency.
 * Called from the agents view, which only mounts while that view is active.
 */
export function useRecordAgentVisit(agentId: string | undefined) {
  const recordAgentVisit = useAppStore((state) => state.recordAgentVisit);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    recordAgentVisit(agentId);
  }, [agentId, recordAgentVisit]);
}
