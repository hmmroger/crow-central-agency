import { useMutation } from "@tanstack/react-query";
import type {
  CreateNoteInput,
  DeletedResult,
  NoteFileMetadata,
  NoteMetadata,
  ResolveWikilinkInput,
  UpdateNoteInput,
  WriteNoteContentInput,
} from "@crow-central-agency/shared";
import { apiClient, createNote, unwrapResponse } from "../../services/api-client.js";
import type { ApiError } from "../../services/api-client.types.js";

/** Target note plus the fields to change */
interface UpdateNoteVariables {
  noteId: string;
  input: UpdateNoteInput;
}

/** Target note plus the new content and the guard token it was edited from */
interface WriteNoteContentVariables {
  noteId: string;
  input: WriteNoteContentInput;
}

const TRASH_PATH = "/note-trash";

function getNotePath(noteId: string): string {
  return `/notes/${encodeURIComponent(noteId)}`;
}

/** Create a folder or a text note. */
export function useCreateNote() {
  return useMutation<NoteMetadata, ApiError, CreateNoteInput>({
    mutationFn: async (input) => unwrapResponse(await createNote(input)),
  });
}

/** The note a wikilink names, created beside the source note when it names nothing yet. */
export function useResolveWikilink() {
  return useMutation<NoteMetadata, ApiError, ResolveWikilinkInput>({
    mutationFn: async (input) => unwrapResponse(await apiClient.post<NoteMetadata>("/notes/resolve", input)),
  });
}

/** Rename and/or move a note. */
export function useUpdateNote() {
  return useMutation<NoteMetadata, ApiError, UpdateNoteVariables>({
    mutationFn: async ({ noteId, input }) => {
      const response = await apiClient.patch<NoteMetadata>(getNotePath(noteId), input);

      return unwrapResponse(response);
    },
  });
}

/** Delete a note. The backend decides by location — a live note moves to the trash, a trashed one is removed for good. */
export function useDeleteNote() {
  return useMutation<void, ApiError, string>({
    mutationFn: async (noteId) => {
      unwrapResponse(await apiClient.del<DeletedResult>(getNotePath(noteId)));
    },
  });
}

/** Restore a trashed note. The backend derives the path it came from. */
export function useRestoreNote() {
  return useMutation<NoteMetadata, ApiError, string>({
    mutationFn: async (noteId) => {
      const response = await apiClient.post<NoteMetadata>(`${getNotePath(noteId)}/restore`);

      return unwrapResponse(response);
    },
  });
}

/** Permanently remove everything in the trash. */
export function useEmptyTrash() {
  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      unwrapResponse(await apiClient.del<DeletedResult>(TRASH_PATH));
    },
  });
}

/**
 * Write a text note's content under the optimistic-concurrency guard. The
 * cached content is not invalidated — the editor holds the authoritative text
 * and chains the returned token into its next save.
 */
export function useWriteNoteContent() {
  return useMutation<NoteFileMetadata, ApiError, WriteNoteContentVariables>({
    mutationFn: async ({ noteId, input }) => {
      const response = await apiClient.put<NoteFileMetadata>(`${getNotePath(noteId)}/content`, input);

      return unwrapResponse(response);
    },
  });
}
