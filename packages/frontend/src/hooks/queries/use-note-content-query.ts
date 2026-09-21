import { useQuery } from "@tanstack/react-query";
import type { NoteContent } from "@crow-central-agency/shared";
import { fetchRaw } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
import type { ApiError } from "../../services/api-client.types.js";

interface TextNoteContent {
  type: "text";
  content: string;
  updatedTimestamp: number;
}

interface BinaryNoteContent {
  type: "binary";
  blobUrl: string;
  mimeType: string;
}

export type NoteContentResult = TextNoteContent | BinaryNoteContent;

/**
 * Fetch a single note's content via React Query.
 * Text notes come back as markdown; image and unknown notes are fetched
 * through the authenticated client and exposed as a blob URL.
 */
export function useNoteContentQuery(noteId: string, options?: { enabled?: boolean }) {
  return useQuery<NoteContentResult, ApiError>({
    queryKey: noteKeys.content(noteId),
    enabled: options?.enabled ?? true,
    gcTime: 0, // blob URLs are ephemeral — don't cache after unmount
    queryFn: async () => {
      const response = await fetchRaw(`/notes/${encodeURIComponent(noteId)}/content`);
      if (!response.ok) {
        throw new Error(`Failed to fetch note: ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = (await response.json()) as { success: boolean; data: NoteContent };
        return { type: "text", content: json.data.content, updatedTimestamp: json.data.updatedTimestamp };
      }

      const blob = await response.blob();
      return { type: "binary", blobUrl: URL.createObjectURL(blob), mimeType: contentType };
    },
  });
}
