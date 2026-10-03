import { queryOptions, useQuery } from "@tanstack/react-query";
import { NOTE_CONTENT_TYPE, type NoteContent, type NoteFileMetadata } from "@crow-central-agency/shared";
import { apiClient, fetchRaw, unwrapResponse } from "../../services/api-client.js";
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

const DEFAULT_MIME_TYPE = "application/octet-stream";

function getNoteContentPath(noteId: string): string {
  return `/notes/${encodeURIComponent(noteId)}/content`;
}

/** Fetch a text note through the JSON client */
async function fetchTextNote(contentPath: string): Promise<TextNoteContent> {
  const response = await apiClient.get<NoteContent>(contentPath);
  const data = unwrapResponse(response);

  return { type: "text", content: data.content, updatedTimestamp: data.updatedTimestamp };
}

/** Fetch a binary note through the authenticated raw client and expose it as a blob URL */
async function fetchBinaryNote(contentPath: string): Promise<BinaryNoteContent> {
  const response = await fetchRaw(contentPath);
  if (!response.ok) {
    throw new Error(`Failed to fetch note: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") ?? DEFAULT_MIME_TYPE;
  const blob = await response.blob();

  return { type: "binary", blobUrl: URL.createObjectURL(blob), mimeType };
}

/**
 * The one query for a note's content, shared by the reader and the editor's
 * image preview. One endpoint serves live and trashed notes alike, and the
 * note's indexed content type decides the transport, so the caller never has
 * to sniff the response. A binary result's blob URL belongs to the caller,
 * which revokes it when done.
 */
export function noteContentQueryOptions(note: NoteFileMetadata) {
  const { id, contentType } = note;

  return queryOptions<NoteContentResult, ApiError>({
    queryKey: noteKeys.content(id),
    gcTime: 0, // blob URLs are ephemeral — don't cache after unmount
    queryFn: async () => {
      const contentPath = getNoteContentPath(id);

      return contentType === NOTE_CONTENT_TYPE.TEXT ? fetchTextNote(contentPath) : fetchBinaryNote(contentPath);
    },
  });
}

/** Fetch a single note's content via React Query. */
export function useNoteContentQuery(note: NoteFileMetadata, options?: { enabled?: boolean }) {
  return useQuery({
    ...noteContentQueryOptions(note),
    enabled: options?.enabled ?? true,
    // Freshness is governed by the editor's write guard, not by background
    // polls: a refetch behind an unsaved draft would discard it silently.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
