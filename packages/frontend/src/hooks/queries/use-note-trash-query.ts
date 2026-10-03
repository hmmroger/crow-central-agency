import { useQuery } from "@tanstack/react-query";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

interface NoteTrashQueryOptions {
  enabled?: boolean;
}

/**
 * Fetch the trash tree as a flat list. This is the only listing that reaches
 * the trash — a trashed note's id carries a `.trash:` prefix, so it can never
 * turn up in the live tree.
 */
export function useNoteTrashQuery(options?: NoteTrashQueryOptions) {
  return useQuery<NoteMetadata[], ApiError>({
    queryKey: noteKeys.trash(),
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const response = await apiClient.get<NoteMetadata[]>("/note-trash");
      return unwrapResponse(response);
    },
    refetchOnMount: "always",
  });
}
