import { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type AgentTaskItem } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { taskKeys } from "../services/query-keys.js";
import { useWs } from "../hooks/use-ws.js";
import type { ApiError } from "../services/api-client.types.js";
import type { TasksContextValue } from "./tasks-provider.types.js";

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

/**
 * Global task data provider.
 *
 * Fetches all tasks on mount via REST, then subscribes to WebSocket events
 * to keep the task list up-to-date in real time. Any component in the tree
 * can access the current task list via useTasksContext().
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery<AgentTaskItem[], ApiError>({
    queryKey: taskKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgentTaskItem[]>("/tasks");

      return unwrapResponse(response);
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  // Subscribe to WS events to keep cache in sync
  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.TASK_ADDED) {
        queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (prev) => {
          if (!prev) {
            return [message.task];
          }

          return [...prev, message.task];
        });

        return;
      }

      if (
        message.type === SERVER_MESSAGE_TYPE.TASK_UPDATED ||
        message.type === SERVER_MESSAGE_TYPE.TASK_ASSIGNED ||
        message.type === SERVER_MESSAGE_TYPE.TASK_STATE_CHANGED
      ) {
        replaceTaskInCache(queryClient, message.task);

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.TASK_DELETED) {
        queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (prev) => {
          if (!prev) {
            return [];
          }

          return prev.filter((task) => task.id !== message.taskId);
        });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  const value: TasksContextValue = {
    tasks,
    isLoading,
    error: error ?? undefined,
    refetch: () => void refetch(),
  };

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

/**
 * Access the global task list context.
 * Must be used within a TasksProvider.
 */
export function useTasksContext(): TasksContextValue {
  const context = useContext(TasksContext);

  if (!context) {
    throw new Error("useTasksContext must be used within a TasksProvider");
  }

  return context;
}

/** Replace a single task in the query cache by ID */
function replaceTaskInCache(queryClient: QueryClient, updatedTask: AgentTaskItem) {
  queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (prev) => {
    if (!prev) {
      return [updatedTask];
    }

    const index = prev.findIndex((task) => task.id === updatedTask.id);

    if (index >= 0) {
      const updated = [...prev];
      updated[index] = updatedTask;

      return updated;
    }

    // Task not in cache — append (shouldn't normally happen)
    return [...prev, updatedTask];
  });
}
