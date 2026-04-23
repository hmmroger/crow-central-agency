import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FeedInfo, AddFeedInput, DetectFeedsInput } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { feedKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Add a new feed by URL. Invalidates list on success.
 */
export function useAddFeed() {
  const queryClient = useQueryClient();

  return useMutation<FeedInfo, ApiError, AddFeedInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<FeedInfo>("/feeds", input);
      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.list() });
    },
  });
}

/**
 * Detect feeds advertised on a page URL via <link rel="alternate"> tags.
 * Does not mutate server state — the list of detected feeds is not persisted.
 */
export function useDetectFeeds() {
  return useMutation<FeedInfo[], ApiError, DetectFeedsInput>({
    mutationFn: async (input) => {
      const response = await apiClient.post<FeedInfo[]>("/feeds/detect", input);
      return unwrapResponse(response);
    },
  });
}

/**
 * Delete a feed. Optimistically removes from list, rolls back on error.
 */
export function useDeleteFeed(feedId: string) {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, ApiError, void, { previous: FeedInfo[] | undefined }>({
    mutationFn: async () => {
      const response = await apiClient.del<void>(`/feeds/${feedId}`);
      return unwrapResponse(response);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: feedKeys.list() });
      const previous = queryClient.getQueryData<FeedInfo[]>(feedKeys.list());
      queryClient.setQueryData<FeedInfo[]>(feedKeys.list(), (old) => old?.filter((feed) => feed.id !== feedId));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(feedKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.list() });
    },
  });

  const { mutateAsync } = mutation;

  const deleteFn = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return { ...mutation, deleteFn };
}
