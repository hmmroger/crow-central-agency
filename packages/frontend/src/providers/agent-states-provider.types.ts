import type { AgentRuntimeState, SessionUsage } from "@crow-central-agency/shared";

/** Entry held in the provider's state map. Usage is split into a separate map. */
export type AgentStateEntry = Omit<AgentRuntimeState, "sessionUsage">;

/** Callback invoked when any entry in either map changes. */
export type AgentStatesListener = () => void;

/** Value exposed by the AgentStatesProvider context. */
export interface AgentStatesContextValue {
  /** Read the current state entry for an agent, or undefined before hydration. */
  getAgentState: (agentId: string) => AgentStateEntry | undefined;
  /** Read the current session usage for an agent, or undefined before hydration. */
  getAgentSessionUsage: (agentId: string) => SessionUsage | undefined;
  /** Register a change listener; returns an unsubscribe function. */
  subscribe: (listener: AgentStatesListener) => () => void;
  /** Local optimistic append to an agent's input history (dedupe + cap). */
  appendInputHistory: (agentId: string, text: string) => void;
}
