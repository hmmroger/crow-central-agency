import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  CreateNoteInput,
  DeletedResult,
  NoteFileMetadata,
  NoteMetadata,
  UpdateNoteInput,
  WriteNoteContentInput,
} from "@crow-central-agency/shared";
import { apiClient, createNote, unwrapResponse } from "../../services/api-client.js";
import { noteKeys } from "../../services/query-keys.js";
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

/** Trashing and restoring move a note between the two trees, so both are stale. */
function invalidateNoteTrees(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
  void queryClient.invalidateQueries({ queryKey: noteKeys.trash() });
}

/** Create a folder or a text note. Invalidates the tree on success. */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation<NoteMetadata, ApiError, CreateNoteInput>({
    mutationFn: async (input) => unwrapResponse(await createNote(input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
}

/**
 * Rename and/or move a note. A rename or move re-keys the note (and every
 * descendant of a folder), so the whole tree is invalidated rather than patched.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation<NoteMetadata, ApiError, UpdateNoteVariables>({
    mutationFn: async ({ noteId, input }) => {
      const response = await apiClient.patch<NoteMetadata>(getNotePath(noteId), input);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
}

/**
 * Delete a note. The backend decides by location — a live note moves
 * to the trash, a trashed one is removed for good — so both trees are stale.
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (noteId) => {
      unwrapResponse(await apiClient.del<DeletedResult>(getNotePath(noteId)));
    },
    onSuccess: () => invalidateNoteTrees(queryClient),
  });
}

/** Restore a trashed note. The backend derives the path it came from. */
export function useRestoreNote() {
  const queryClient = useQueryClient();

  return useMutation<NoteMetadata, ApiError, string>({
    mutationFn: async (noteId) => {
      const response = await apiClient.post<NoteMetadata>(`${getNotePath(noteId)}/restore`);

      return unwrapResponse(response);
    },
    onSuccess: () => invalidateNoteTrees(queryClient),
  });
}

/** Permanently remove everything in the trash. */
export function useEmptyTrash() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: async () => {
      unwrapResponse(await apiClient.del<DeletedResult>(TRASH_PATH));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.trash() });
    },
  });
}

/**
 * Write a text note's content under the optimistic-concurrency guard. The
 * cached content is not invalidated — the editor holds the authoritative text
 * and chains the returned token into its next save.
 */
export function useWriteNoteContent() {
  const queryClient = useQueryClient();

  return useMutation<NoteFileMetadata, ApiError, WriteNoteContentVariables>({
    mutationFn: async ({ noteId, input }) => {
      const response = await apiClient.put<NoteFileMetadata>(`${getNotePath(noteId)}/content`, input);

      return unwrapResponse(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
    },
  });
}
