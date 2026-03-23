import { useCallback, useEffect, useState } from "react";
import type { AgentConfig } from "@crow-central-agency/shared";
import { apiClient } from "../services/api-client.js";
import { useWs } from "./use-ws.js";

/**
 * Fetch the agent list via REST on mount, then listen for WS updates
 * (agent_updated, agent_status) to keep the list current.
 */
export function useAgents() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { onMessage } = useWs();

  /** Fetch agent list from REST API */
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const response = await apiClient.get<AgentConfig[]>("/agents");

    if (response.success) {
      setAgents(response.data);
    }

    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Listen for WS updates to keep list current
  useEffect(() => {
    const unregister = onMessage((raw) => {
      const message = raw as { type?: string; agentId?: string; config?: AgentConfig };

      if (message.type === "agent_updated" && message.config) {
        setAgents((prev) => {
          const index = prev.findIndex((agent) => agent.id === message.agentId);

          if (index >= 0) {
            const updated = [...prev];
            updated[index] = message.config as AgentConfig;

            return updated;
          }

          // New agent — append
          return [...prev, message.config as AgentConfig];
        });
      }
    });

    return unregister;
  }, [onMessage]);

  return { agents, loading, refetch: fetchAgents };
}
