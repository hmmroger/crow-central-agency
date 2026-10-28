import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AGENT_STATUS,
  MAX_INPUT_HISTORY,
  SERVER_MESSAGE_TYPE,
  isAgentServerMessage,
  type AgentRuntimeState,
  type PendingPermissionInfo,
  type PendingQuestionInfo,
  type SessionUsage,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { agentKeys } from "../services/query-keys.js";
import { useWs } from "../hooks/use-ws.js";
import { WS_STATE } from "../services/ws-client.types.js";
import type { ApiError } from "../services/api-client.types.js";
import type { AgentStateEntry, AgentStatesContextValue, AgentStatesListener } from "./agent-states-provider.types.js";

interface AgentStatesProviderProps {
  children: ReactNode;
}

export const AgentStatesContext = createContext<AgentStatesContextValue | undefined>(undefined);
/** Separate from the main context so only count consumers re-render when it changes */
const ActiveAgentCountContext = createContext<number | undefined>(undefined);

function splitRuntimeState(state: AgentRuntimeState): { entry: AgentStateEntry; usage: SessionUsage } {
  const { sessionUsage, ...entry } = state;
  return { entry, usage: sessionUsage };
}

function buildDefaultEntry(agentId: string): AgentStateEntry {
  return { agentId, status: AGENT_STATUS.IDLE, activeDomainFragmentIds: [] };
}

export function AgentStatesProvider({ children }: AgentStatesProviderProps) {
  const { onMessage, connectionState } = useWs();

  const stateMapRef = useRef<Map<string, AgentStateEntry>>(new Map());
  const usageMapRef = useRef<Map<string, SessionUsage>>(new Map());
  const listenersRef = useRef<Set<AgentStatesListener>>(new Set());
  /** Agents listed to the user: snapshot ids plus created, minus deleted. Excludes background agents. */
  const listedAgentIdsRef = useRef<Set<string>>(new Set());
  const [activeAgentCount, setActiveAgentCount] = useState(0);

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const recomputeActiveAgentCount = useCallback(() => {
    let activeCount = 0;
    for (const agentId of listedAgentIdsRef.current) {
      const status = stateMapRef.current.get(agentId)?.status;
      if (status !== undefined && status !== AGENT_STATUS.IDLE) {
        activeCount++;
      }
    }

    setActiveAgentCount(activeCount);
  }, []);

  const patchState = useCallback(
    (agentId: string, patch: (prev: AgentStateEntry | undefined) => AgentStateEntry | undefined): boolean => {
      const prev = stateMapRef.current.get(agentId);
      const next = patch(prev);
      if (next === prev) {
        return false;
      }

      if (next === undefined) {
        stateMapRef.current.delete(agentId);
      } else {
        stateMapRef.current.set(agentId, next);
      }

      return true;
    },
    []
  );

  const { data, refetch } = useQuery<AgentRuntimeState[], ApiError>({
    queryKey: agentKeys.states(),
    queryFn: async () => {
      const response = await apiClient.get<AgentRuntimeState[]>("/agents/states");

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    stateMapRef.current = new Map();
    usageMapRef.current = new Map();
    listedAgentIdsRef.current = new Set();
    for (const state of data) {
      const { entry, usage } = splitRuntimeState(state);
      stateMapRef.current.set(state.agentId, entry);
      usageMapRef.current.set(state.agentId, usage);
      listedAgentIdsRef.current.add(state.agentId);
    }

    notify();
    recomputeActiveAgentCount();
  }, [data, notify, recomputeActiveAgentCount]);

  const previousConnectionStateRef = useRef(connectionState);
  useEffect(() => {
    const previous = previousConnectionStateRef.current;
    previousConnectionStateRef.current = connectionState;

    if (
      connectionState === WS_STATE.CONNECTED &&
      (previous === WS_STATE.RECONNECTING || previous === WS_STATE.DISCONNECTED)
    ) {
      void refetch();
    }
  }, [connectionState, refetch]);

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (!isAgentServerMessage(message)) {
        return;
      }

      const { agentId } = message;

      if (message.type === SERVER_MESSAGE_TYPE.AGENT_STATE_UPDATED) {
        const { entry, usage } = splitRuntimeState(message.state);
        const prev = stateMapRef.current.get(agentId);
        const nextEntry: AgentStateEntry = { ...entry, inputHistory: prev?.inputHistory ?? entry.inputHistory };
        stateMapRef.current.set(agentId, nextEntry);
        usageMapRef.current.set(agentId, usage);
        notify();
        recomputeActiveAgentCount();

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.AGENT_CREATED) {
        listedAgentIdsRef.current.add(agentId);
        recomputeActiveAgentCount();

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.AGENT_USAGE) {
        usageMapRef.current.set(agentId, {
          inputTokens: message.inputTokens,
          outputTokens: message.outputTokens,
          totalCostUsd: message.totalCostUsd,
          contextUsed: message.contextUsed,
          contextTotal: message.contextTotal,
        });
        notify();

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.AGENT_STATUS) {
        const nextMessageSource = message.messageSource;
        const changed = patchState(agentId, (prev) => {
          const base = prev ?? buildDefaultEntry(agentId);
          if (prev && base.status === message.status && base.messageSource === nextMessageSource) {
            return prev;
          }

          return { ...base, status: message.status, messageSource: nextMessageSource };
        });
        if (changed) {
          notify();
          recomputeActiveAgentCount();
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.PERMISSION_REQUEST) {
        const permInfo: PendingPermissionInfo = {
          toolUseId: message.toolUseId,
          toolName: message.toolName,
          input: message.input,
          autoApproveRules: message.autoApproveRules,
          decisionReason: message.decisionReason,
        };
        const changed = patchState(agentId, (prev) => {
          const base = prev ?? buildDefaultEntry(agentId);
          const existing = base.pendingPermissions ?? [];
          if (existing.some((perm) => perm.toolUseId === permInfo.toolUseId)) {
            return prev;
          }

          return { ...base, pendingPermissions: [...existing, permInfo] };
        });
        if (changed) {
          notify();
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.PERMISSION_CANCELLED) {
        const { toolUseId } = message;
        const changed = patchState(agentId, (prev) => {
          if (!prev) {
            return prev;
          }

          const existing = prev.pendingPermissions ?? [];
          const filtered = existing.filter((perm) => perm.toolUseId !== toolUseId);
          if (filtered.length === existing.length) {
            return prev;
          }

          return { ...prev, pendingPermissions: filtered };
        });
        if (changed) {
          notify();
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.QUESTION_REQUEST) {
        const questionInfo: PendingQuestionInfo = {
          toolUseId: message.toolUseId,
          questions: message.questions,
        };
        const changed = patchState(agentId, (prev) => {
          if (prev && prev.pendingQuestion?.toolUseId === questionInfo.toolUseId) {
            return prev;
          }

          const base = prev ?? buildDefaultEntry(agentId);

          return { ...base, pendingQuestion: questionInfo };
        });
        if (changed) {
          notify();
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.QUESTION_RESOLVED) {
        const { toolUseId } = message;
        const changed = patchState(agentId, (prev) => {
          if (!prev || prev.pendingQuestion?.toolUseId !== toolUseId) {
            return prev;
          }

          return { ...prev, pendingQuestion: undefined };
        });
        if (changed) {
          notify();
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.AGENT_DELETED) {
        const hadState = stateMapRef.current.delete(agentId);
        const hadUsage = usageMapRef.current.delete(agentId);
        listedAgentIdsRef.current.delete(agentId);
        if (hadState || hadUsage) {
          notify();
        }

        recomputeActiveAgentCount();
      }
    });

    return unregister;
  }, [onMessage, notify, patchState, recomputeActiveAgentCount]);

  const getAgentState = useCallback((agentId: string) => stateMapRef.current.get(agentId), []);
  const getAgentSessionUsage = useCallback((agentId: string) => usageMapRef.current.get(agentId), []);
  const subscribe = useCallback((listener: AgentStatesListener) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const appendInputHistory = useCallback(
    (agentId: string, text: string) => {
      const changed = patchState(agentId, (prev) => {
        if (!prev) {
          return prev;
        }

        const history = prev.inputHistory ?? [];
        if (history[history.length - 1] === text) {
          return prev;
        }

        return { ...prev, inputHistory: [...history, text].slice(-MAX_INPUT_HISTORY) };
      });
      if (changed) {
        notify();
      }
    },
    [patchState, notify]
  );

  const value = useMemo<AgentStatesContextValue>(
    () => ({ getAgentState, getAgentSessionUsage, subscribe, appendInputHistory }),
    [getAgentState, getAgentSessionUsage, subscribe, appendInputHistory]
  );

  return (
    <AgentStatesContext.Provider value={value}>
      <ActiveAgentCountContext.Provider value={activeAgentCount}>{children}</ActiveAgentCountContext.Provider>
    </AgentStatesContext.Provider>
  );
}

export function useAgentStatesContext(): AgentStatesContextValue {
  const context = useContext(AgentStatesContext);
  if (!context) {
    throw new Error("useAgentStatesContext must be used within an AgentStatesProvider");
  }

  return context;
}

/** Number of listed (non-background) agents whose status is not idle */
export function useActiveAgentCount(): number {
  const activeAgentCount = useContext(ActiveAgentCountContext);
  if (activeAgentCount === undefined) {
    throw new Error("useActiveAgentCount must be used within an AgentStatesProvider");
  }

  return activeAgentCount;
}
