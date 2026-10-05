import { queryOptions, useQuery } from "@tanstack/react-query";
import { ApiErrorSchema, createApiSuccessSchema, NoteContentSchema } from "@crow-central-agency/shared";
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

const JSON_CONTENT_TYPE = "application/json";
const DEFAULT_MIME_TYPE = "application/octet-stream";
const NoteContentResponseSchema = createApiSuccessSchema(NoteContentSchema);

function getNoteContentPath(noteId: string): string {
  return `/notes/${encodeURIComponent(noteId)}/content`;
}

/** Text notes and errors arrive as JSON; anything else is the note's bytes, exposed as a blob URL */
async function fetchNoteContent(noteId: string): Promise<NoteContentResult> {
  const response = await fetchRaw(getNoteContentPath(noteId));
  const mimeType = response.headers.get("content-type") ?? DEFAULT_MIME_TYPE;

  if (mimeType.includes(JSON_CONTENT_TYPE)) {
    const body: unknown = await response.json();
    const parsed = NoteContentResponseSchema.safeParse(body);
    if (parsed.success) {
      const { content, updatedTimestamp } = parsed.data.data;

      return { type: "text", content, updatedTimestamp };
    }

    const failure = ApiErrorSchema.safeParse(body);
    const error: ApiError = failure.success
      ? failure.data.error
      : { code: "invalid_response", message: "Unexpected note content response" };

    throw error;
  }

  if (!response.ok) {
    const error: ApiError = { code: "http_error", message: `Failed to fetch note: ${response.status}` };

    throw error;
  }

  const blob = await response.blob();

  return { type: "binary", blobUrl: URL.createObjectURL(blob), mimeType };
}

/**
 * The one query for a note's content, shared by the reader, the editor and its
 * image preview. One endpoint serves live and trashed notes alike, and the
 * response decides the transport. A binary result's blob URL belongs to the
 * caller, which revokes it when done.
 */
export function noteContentQueryOptions(noteId: string) {
  return queryOptions<NoteContentResult, ApiError>({
    queryKey: noteKeys.content(noteId),
    gcTime: 0, // blob URLs are ephemeral — don't cache after unmount
    queryFn: () => fetchNoteContent(noteId),
  });
}

/** Fetch a single note's content via React Query. */
export function useNoteContentQuery(noteId: string, options?: { enabled?: boolean }) {
  return useQuery({
    ...noteContentQueryOptions(noteId),
    enabled: options?.enabled ?? true,
    // Freshness is governed by the editor's write guard, not by background
    // polls: a refetch behind an unsaved draft would discard it silently.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
