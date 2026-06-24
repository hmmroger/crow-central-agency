import { createContext, useContext, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type AgentBuilderDraftResponse } from "@crow-central-agency/shared";
import { agentBuilderKeys } from "../services/query-keys.js";
import { useWs } from "../hooks/use-ws.js";
import { useAgentBuilderDraftQuery } from "../hooks/queries/use-agent-builder-draft-query.js";
import type { AgentBuilderContextValue } from "./agent-builder-provider.types.js";

const AgentBuilderContext = createContext<AgentBuilderContextValue | undefined>(undefined);

/**
 * Global agent-builder draft provider. Lives at the app root so the draft-updated WS subscription
 * stays mounted on every page — a build keeps streaming into the cache even when the view is closed.
 */
export function AgentBuilderProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();
  const query = useAgentBuilderDraftQuery();

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.AGENT_BUILDER_DRAFT_UPDATED) {
        queryClient.setQueryData<AgentBuilderDraftResponse>(agentBuilderKeys.draft(), { draft: message.draft });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  const value: AgentBuilderContextValue = {
    draft: query.data,
    isLoading: query.isLoading,
    error: query.error ?? undefined,
  };

  return <AgentBuilderContext.Provider value={value}>{children}</AgentBuilderContext.Provider>;
}

/**
 * Access the global agent-builder draft context.
 * Must be used within an AgentBuilderProvider.
 */
export function useAgentBuilderContext(): AgentBuilderContextValue {
  const context = useContext(AgentBuilderContext);

  if (!context) {
    throw new Error("useAgentBuilderContext must be used within an AgentBuilderProvider");
  }

  return context;
}
