import { useCallback, useEffect, useState } from "react";
import { AgentUpdatedWsMessageSchema, AgentStatusWsMessageSchema, type AgentConfig } from "@crow-central-agency/shared";
import { apiClient } from "../services/api-client.js";
import { useWs } from "./use-ws.js";

/**
 * Fetch the agent list via REST on mount, then listen for WS updates
 * (agent_updated, agent_status) to keep the list current.
 */
export function useAgents() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const { onMessage } = useWs();

  /** Fetch agent list from REST API */
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const response = await apiClient.get<AgentConfig[]>("/agents");

      if (response.success) {
        setAgents(response.data);
      } else {
        setError(response.error.message);
      }
    } catch {
      setError("Failed to reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Listen for WS updates to keep list current
  useEffect(() => {
    const unregister = onMessage((raw) => {
      // Handle agent_updated — full config refresh
      const updatedResult = AgentUpdatedWsMessageSchema.safeParse(raw);

      if (updatedResult.success) {
        const { agentId, config } = updatedResult.data;

        setAgents((prev) => {
          const index = prev.findIndex((agent) => agent.id === agentId);

          if (index >= 0) {
            const updated = [...prev];
            updated[index] = config;

            return updated;
          }

          // New agent — append
          return [...prev, config];
        });

        return;
      }

      // Handle agent_status — update status display (Phase 2+ will use this for live status)
      const statusResult = AgentStatusWsMessageSchema.safeParse(raw);

      if (statusResult.success) {
        // Status tracking will be implemented in Phase 2 with runtime state
        // For now, just acknowledge the message type is handled
      }
    });

    return unregister;
  }, [onMessage]);

  return { agents, loading, error, refetch: fetchAgents };
}
