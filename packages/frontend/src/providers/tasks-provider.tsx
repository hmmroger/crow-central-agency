/**
 * Global task data provider.
 *
 * Fetches all tasks on mount via REST, then subscribes to WebSocket events
 * to keep the task list up-to-date in real time. Any component in the tree
 * can access the current task list via useTasksContext().
 */

import { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TaskAddedWsMessageSchema,
  TaskUpdatedWsMessageSchema,
  TaskAssignedWsMessageSchema,
  TaskStateChangedWsMessageSchema,
  TaskDeletedWsMessageSchema,
  type AgentTaskItem,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import { taskKeys } from "../services/query-keys.js";
import { useWs } from "../hooks/use-ws.js";
import type { ApiError } from "../services/api-client.types.js";
import type { TasksContextValue } from "./tasks-provider.types.js";

const TasksContext = createContext<TasksContextValue | undefined>(undefined);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage } = useWs();

  const {
    data: tasks = [],
    isLoading,
    error,
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
    const unregister = onMessage((raw) => {
      // task_added — append to list
      const addedResult = TaskAddedWsMessageSchema.safeParse(raw);
      if (addedResult.success) {
        queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (prev) => {
          if (!prev) {
            return [addedResult.data.task];
          }

          return [...prev, addedResult.data.task];
        });

        return;
      }

      // task_updated — replace in list (content edit)
      const updatedResult = TaskUpdatedWsMessageSchema.safeParse(raw);
      if (updatedResult.success) {
        replaceTaskInCache(queryClient, updatedResult.data.task);

        return;
      }

      // task_assigned — replace in list
      const assignedResult = TaskAssignedWsMessageSchema.safeParse(raw);
      if (assignedResult.success) {
        replaceTaskInCache(queryClient, assignedResult.data.task);

        return;
      }

      // task_state_changed — replace in list
      const stateResult = TaskStateChangedWsMessageSchema.safeParse(raw);
      if (stateResult.success) {
        replaceTaskInCache(queryClient, stateResult.data.task);

        return;
      }

      // task_deleted — remove from list
      const deletedResult = TaskDeletedWsMessageSchema.safeParse(raw);
      if (deletedResult.success) {
        queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (prev) => {
          if (!prev) {
            return [];
          }

          return prev.filter((task) => task.id !== deletedResult.data.taskId);
        });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  const value: TasksContextValue = { tasks, isLoading, error: error ?? undefined };

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
function replaceTaskInCache(queryClient: ReturnType<typeof useQueryClient>, updatedTask: AgentTaskItem) {
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
