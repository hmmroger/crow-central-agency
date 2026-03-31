import type { AgentTaskItem } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

/** Value exposed by the TasksProvider context */
export interface TasksContextValue {
  /** All tasks, kept current via WS events */
  tasks: AgentTaskItem[];
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error from the initial fetch, if any */
  error: ApiError | undefined;
  /** Refetch the task list from the server */
  refetch: () => void;
}
