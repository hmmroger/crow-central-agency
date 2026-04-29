import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AgentCreatedWsMessageSchema,
  AgentDeletedWsMessageSchema,
  AgentUpdatedWsMessageSchema,
  type AgentConfig,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import { useWs } from "../hooks/use-ws.js";
import { WS_STATE } from "../services/ws-client.types.js";
import type { ApiError } from "../services/api-client.types.js";
import type { AgentsContextValue } from "./agents-provider.types.js";

const AgentsContext = createContext<AgentsContextValue | undefined>(undefined);

/**
 * Global agents data provider.
 *
 * Fetches the agent list once via REST, keeps it in sync with
 * `agent_created` / `agent_updated` / `agent_deleted` WS events, and
 * refetches when the WS recovers from a disconnect to backfill any
 * events missed during the outage.
 */
export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();

  const {
    data: agents = [],
    isLoading,
    error,
    refetch,
  } = useQuery<AgentConfig[], ApiError>({
    queryKey: agentKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgentConfig[]>("/agents");

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  // WS listener — apply create/update/delete directly to the cache.
  // TODO: consider doing away with mutation invalidate and centralize update here.
  useEffect(() => {
    const unregister = onMessage((raw) => {
      const updatedResult = AgentUpdatedWsMessageSchema.safeParse(raw);
      if (updatedResult.success) {
        const { agentId, config } = updatedResult.data;
        queryClient.setQueryData<AgentConfig[]>(agentKeys.list(), (prev) => {
          if (!prev) {
            return [config];
          }

          const index = prev.findIndex((agent) => agent.id === agentId);
          if (index >= 0) {
            const next = [...prev];
            next[index] = config;
            return next;
          }

          return [...prev, config];
        });

        return;
      }

      const createdResult = AgentCreatedWsMessageSchema.safeParse(raw);
      if (createdResult.success) {
        const { config } = createdResult.data;
        queryClient.setQueryData<AgentConfig[]>(agentKeys.list(), (prev) => {
          if (!prev) {
            return [config];
          }

          if (prev.some((agent) => agent.id === config.id)) {
            return prev;
          }

          return [...prev, config];
        });

        return;
      }

      const deletedResult = AgentDeletedWsMessageSchema.safeParse(raw);
      if (deletedResult.success) {
        const { agentId } = deletedResult.data;
        queryClient.setQueryData<AgentConfig[]>(agentKeys.list(), (prev) => {
          if (!prev) {
            return [];
          }

          return prev.filter((agent) => agent.id !== agentId);
        });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  // Refetch on WS reconnect to backfill any events missed during the outage.
  const previousStateRef = useRef(connectionState);
  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = connectionState;

    if (
      connectionState === WS_STATE.CONNECTED &&
      (previousState === WS_STATE.RECONNECTING || previousState === WS_STATE.DISCONNECTED)
    ) {
      void refetch();
    }
  }, [connectionState, refetch]);

  const getAgent = useCallback(
    (agentId: string | undefined) => {
      if (!agentId) {
        return undefined;
      }

      return agents.find((agent) => agent.id === agentId);
    },
    [agents]
  );

  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<AgentsContextValue>(
    () => ({
      agents,
      isLoading,
      error: error ?? undefined,
      refetch: handleRefetch,
      getAgent,
    }),
    [agents, isLoading, error, handleRefetch, getAgent]
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

/**
 * Access the global agents context.
 * Must be used within an AgentsProvider.
 */
export function useAgentsContext(): AgentsContextValue {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error("useAgentsContext must be used within an AgentsProvider");
  }

  return context;
}
