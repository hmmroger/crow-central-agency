import { useQuery } from "@tanstack/react-query";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/**
 * Fetch the live note tree as a flat list via React Query.
 * The backend indexes notes on startup, so refetching on mount picks up
 * out-of-band edits made since the view was last opened.
 */
export function useNotesQuery() {
  return useQuery<NoteMetadata[], ApiError>({
    queryKey: noteKeys.tree(),
    queryFn: async () => {
      const response = await apiClient.get<NoteMetadata[]>("/notes");
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}
