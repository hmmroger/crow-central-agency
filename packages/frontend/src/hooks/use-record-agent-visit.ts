import { useEffect } from "react";
import { useAppStore } from "../stores/app-store.js";

/** Single recording site for agent recency — call only from the agents view, which mounts only while that view is active. */
export function useRecordAgentVisit(agentId: string | undefined) {
  const recordAgentVisit = useAppStore((state) => state.recordAgentVisit);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    recordAgentVisit(agentId);
  }, [agentId, recordAgentVisit]);
}
