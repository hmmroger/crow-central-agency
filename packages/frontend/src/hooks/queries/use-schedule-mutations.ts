import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateScheduleInput, Schedule, UpdateScheduleInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { scheduleKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Target schedule plus the fields to change */
interface UpdateScheduleVariables {
  scheduleId: string;
  input: UpdateScheduleInput;
}

/** Create a schedule. Invalidates the list on success. */
export function useCreateSchedule() {
  const queryClient = useQueryClient();

  return useMutation<Schedule, ApiError, CreateScheduleInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<Schedule>("/schedules", input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.list() });
    },
  });
}

/**
 * Apply a partial update to a schedule. The list is patched optimistically so the
 * card toggle does not bounce back while the request is in flight.
 */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();

  return useMutation<Schedule, ApiError, UpdateScheduleVariables, { previous: Schedule[] | undefined }>({
    mutationFn: async ({ scheduleId, input }) => {
      const response = await apiClient.patch<Schedule>(`/schedules/${scheduleId}`, input);

      return unwrapResponse(response);
    },
    onMutate: async ({ scheduleId, input }) => {
      await queryClient.cancelQueries({ queryKey: scheduleKeys.list() });
      const previous = queryClient.getQueryData<Schedule[]>(scheduleKeys.list());
      queryClient.setQueryData<Schedule[]>(scheduleKeys.list(), (old) =>
        old?.map((schedule) => (schedule.id === scheduleId ? { ...schedule, ...input } : schedule))
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(scheduleKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.list() });
    },
  });
}

/** Delete a schedule. Optimistically removes from the list, rolls back on error. */
export function useDeleteSchedule(scheduleId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, ApiError, void, { previous: Schedule[] | undefined }>({
    mutationFn: async () => {
      const response = await apiClient.del<void>(`/schedules/${scheduleId}`);

      return unwrapResponse(response);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: scheduleKeys.list() });
      const previous = queryClient.getQueryData<Schedule[]>(scheduleKeys.list());
      queryClient.setQueryData<Schedule[]>(scheduleKeys.list(), (old) =>
        old?.filter((schedule) => schedule.id !== scheduleId)
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(scheduleKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.list() });
    },
  });

  const { mutateAsync } = mutation;

  const deleteFn = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return { ...mutation, deleteFn };
}

/** Fire a schedule on demand. Invalidates the list so the last-fired stamp refreshes. */
export function useRunSchedule(scheduleId: string) {
  const queryClient = useQueryClient();

  return useMutation<Schedule, ApiError, void>({
    mutationFn: async () => {
      const response = await apiClient.post<Schedule>(`/schedules/${scheduleId}/run`);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKeys.list() });
    },
  });
}
