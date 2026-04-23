import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AgentTaskItem,
  CreateTaskInput,
  UpdateTaskInput,
  UpdateTaskStateInput,
  AssignTaskInput,
} from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { taskKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Create a new task. Optionally assigns to an agent at creation time.
 * Invalidates task list on success.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation<AgentTaskItem, ApiError, CreateTaskInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<AgentTaskItem>("/tasks", input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

/**
 * Update task content (only OPEN tasks).
 * Invalidates task list on success.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation<AgentTaskItem, ApiError, { taskId: string; input: UpdateTaskInput }>({
    mutationFn: async ({ taskId, input }) => {
      const response = await apiClient.patch<AgentTaskItem>(`/tasks/${taskId}`, input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

/**
 * Transition task state.
 * Invalidates task list on success.
 */
export function useUpdateTaskState() {
  const queryClient = useQueryClient();

  return useMutation<AgentTaskItem, ApiError, { taskId: string; input: UpdateTaskStateInput }>({
    mutationFn: async ({ taskId, input }) => {
      const response = await apiClient.patch<AgentTaskItem>(`/tasks/${taskId}/state`, input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

/**
 * Assign a task to an agent or the user (only OPEN tasks).
 * Invalidates task list on success.
 */
export function useAssignTask() {
  const queryClient = useQueryClient();

  return useMutation<AgentTaskItem, ApiError, { taskId: string; input: AssignTaskInput }>({
    mutationFn: async ({ taskId, input }) => {
      const response = await apiClient.post<AgentTaskItem>(`/tasks/${taskId}/assign`, input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}

/**
 * Delete a task. Optimistically removes from list, rolls back on error.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string, { previous: AgentTaskItem[] | undefined }>({
    mutationFn: async (taskId) => {
      const response = await apiClient.del<{ deleted: boolean }>(`/tasks/${taskId}`);
      unwrapResponse(response);
    },
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.list() });
      const previous = queryClient.getQueryData<AgentTaskItem[]>(taskKeys.list());
      queryClient.setQueryData<AgentTaskItem[]>(taskKeys.list(), (old) => old?.filter((task) => task.id !== taskId));
      return { previous };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(taskKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.list() });
    },
  });
}
