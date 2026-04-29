import type { AgentConfig } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

/** Value exposed by the AgentsProvider context */
export interface AgentsContextValue {
  /** All agents, kept current via WS events and reconnect refetch */
  agents: AgentConfig[];
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error from the initial fetch, if any */
  error: ApiError | undefined;
  /** Refetch the agents list from the server */
  refetch: () => void;
  /** Look up a single agent by id from the cached list */
  getAgent: (agentId: string | undefined) => AgentConfig | undefined;
}
