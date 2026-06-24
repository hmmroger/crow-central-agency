import type { AgentBuilderDraftView } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

/** Value exposed by the AgentBuilderProvider context */
export interface AgentBuilderContextValue {
  /** The single active draft (resolved view), kept current via WS — undefined when none exists */
  draft: AgentBuilderDraftView | undefined;
  /** Whether the initial draft fetch is in progress */
  isLoading: boolean;
  /** Error from the initial fetch, if any */
  error: ApiError | undefined;
}
