import { useQuery } from "@tanstack/react-query";
import type { NoteFolderMetadata } from "@crow-central-agency/shared";
import { apiClient, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

/** The live folders a note may move into. */
export function useNoteMoveDestinationsQuery(noteId: string) {
  return useQuery<NoteFolderMetadata[], ApiError>({
    queryKey: noteKeys.moveDestinations(noteId),
    queryFn: async () => {
      const response = await apiClient.get<NoteFolderMetadata[]>(
        `/notes/${encodeURIComponent(noteId)}/move-destinations`
      );

      return unwrapResponse(response);
    },
  });
}
