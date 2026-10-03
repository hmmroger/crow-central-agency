import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ENTITY_TYPE,
  SERVER_MESSAGE_TYPE,
  type CreateNoteInput,
  type NoteMetadata,
  type UpdateNoteInput,
} from "@crow-central-agency/shared";
import {
  useCreateNote,
  useDeleteNote,
  useEmptyTrash,
  useResolveWikilink,
  useRestoreNote,
  useUpdateNote,
} from "../hooks/queries/use-note-mutations.js";
import { useWs } from "../hooks/use-ws.js";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import type { ApiError } from "../services/api-client.types.js";
import { noteKeys } from "../services/query-keys.js";
import { WS_STATE } from "../services/ws-client.types.js";
import { useAppStore } from "../stores/app-store.js";
import { NotesIndex } from "./notes-index.js";
import type { NotesContextValue } from "./notes-provider.types.js";

const NOTES_PATH = "/notes";
const TRASH_PATH = "/note-trash";

const NotesContext = createContext<NotesContextValue | undefined>(undefined);

/**
 * The one owner of note metadata and note operations. Loads the live and
 * trash lists into a private index, keeps it current from note WS events and
 * mutation results, and rebuilds it from the lists after a WS reconnect.
 */
export function NotesProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();
  const notesIndexRef = useRef(new NotesIndex());
  const [notesIndex, setNotesIndex] = useState(() => notesIndexRef.current.snapshot());
  const { mutateAsync: createNoteMutation } = useCreateNote();
  const { mutateAsync: updateNoteMutation } = useUpdateNote();
  const { mutateAsync: deleteNoteMutation } = useDeleteNote();
  const { mutateAsync: restoreNoteMutation } = useRestoreNote();
  const { mutateAsync: emptyTrashMutation } = useEmptyTrash();
  const { mutateAsync: resolveWikilinkMutation } = useResolveWikilink();

  const treeQuery = useQuery<NoteMetadata[], ApiError>({
    queryKey: noteKeys.tree(),
    queryFn: async () => unwrapResponse(await apiClient.get<NoteMetadata[]>(NOTES_PATH)),
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  const trashQuery = useQuery<NoteMetadata[], ApiError>({
    queryKey: noteKeys.trash(),
    queryFn: async () => unwrapResponse(await apiClient.get<NoteMetadata[]>(TRASH_PATH)),
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  const publish = useCallback(() => {
    setNotesIndex(notesIndexRef.current.snapshot());
  }, []);

  // The one place a selection pointing at a note that left the index is cleared.
  const clearSelections = useCallback((removedIds: string[]) => {
    const { selectedNoteId, selectedTrashNoteId, selectNote, selectTrashNote } = useAppStore.getState();

    if (selectedNoteId !== undefined && removedIds.includes(selectedNoteId)) {
      selectNote(undefined);
    }

    if (selectedTrashNoteId !== undefined && removedIds.includes(selectedTrashNoteId)) {
      selectTrashNote(undefined);
    }
  }, []);

  const replaceNotes = useCallback(
    (isTrashed: boolean, notes: NoteMetadata[]) => {
      clearSelections(notesIndexRef.current.replace(isTrashed, notes));
      publish();
    },
    [clearSelections, publish]
  );

  const setNote = useCallback(
    (metadata: NoteMetadata, previousId = metadata.id) => {
      if (previousId !== metadata.id) {
        notesIndexRef.current.delete(previousId);
        clearSelections([previousId]);
      }

      notesIndexRef.current.set(metadata);
      publish();
    },
    [clearSelections, publish]
  );

  const removeNote = useCallback(
    (noteId: string) => {
      notesIndexRef.current.delete(noteId);
      clearSelections([noteId]);
      publish();
    },
    [clearSelections, publish]
  );

  useLayoutEffect(() => {
    if (treeQuery.data) {
      replaceNotes(false, treeQuery.data);
    }
  }, [treeQuery.data, replaceNotes]);

  useLayoutEffect(() => {
    if (trashQuery.data) {
      replaceNotes(true, trashQuery.data);
    }
  }, [trashQuery.data, replaceNotes]);

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.NOTE_CREATED) {
        setNote(message.metadata);
        void queryClient.invalidateQueries({ queryKey: noteKeys.links() });

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.NOTE_UPDATED) {
        const { noteId, metadata } = message;
        const previous = notesIndexRef.current.getNote(noteId);
        setNote(metadata);
        if (previous?.name !== metadata.name || previous.path !== metadata.path) {
          void queryClient.invalidateQueries({ queryKey: noteKeys.links() });
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.NOTE_DELETED) {
        removeNote(message.noteId);
        queryClient.removeQueries({ queryKey: noteKeys.content(message.noteId) });
        void queryClient.invalidateQueries({ queryKey: noteKeys.links() });
      }
    });

    return unregister;
  }, [onMessage, queryClient, setNote, removeNote]);

  // Events sent while disconnected are lost, so the lists are reloaded and the index rebuilt from them.
  const previousStateRef = useRef(connectionState);
  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = connectionState;

    if (
      connectionState === WS_STATE.CONNECTED &&
      (previousState === WS_STATE.RECONNECTING || previousState === WS_STATE.DISCONNECTED)
    ) {
      void queryClient.invalidateQueries({ queryKey: noteKeys.tree() });
      void queryClient.invalidateQueries({ queryKey: noteKeys.trash() });
      void queryClient.invalidateQueries({ queryKey: noteKeys.links() });
    }
  }, [connectionState, queryClient]);

  const createEntry = useCallback(
    async (input: CreateNoteInput) => {
      const metadata = await createNoteMutation(input);
      setNote(metadata);

      return metadata.id;
    },
    [createNoteMutation, setNote]
  );

  const createNote = useCallback(
    (parentId: string | undefined, name: string) => createEntry({ parentId, name, entityType: ENTITY_TYPE.NOTE }),
    [createEntry]
  );

  const createFolder = useCallback(
    (parentId: string | undefined, name: string) =>
      createEntry({ parentId, name, entityType: ENTITY_TYPE.NOTE_FOLDER }),
    [createEntry]
  );

  const updateNote = useCallback(
    async (noteId: string, input: UpdateNoteInput) => {
      const metadata = await updateNoteMutation({ noteId, input });
      setNote(metadata, noteId);

      return metadata.id;
    },
    [updateNoteMutation, setNote]
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      await deleteNoteMutation(noteId);
      removeNote(noteId);
    },
    [deleteNoteMutation, removeNote]
  );

  const restoreNote = useCallback(
    async (noteId: string) => {
      const metadata = await restoreNoteMutation(noteId);
      setNote(metadata, noteId);

      return metadata.id;
    },
    [restoreNoteMutation, setNote]
  );

  const emptyTrash = useCallback(async () => {
    await emptyTrashMutation();
    replaceNotes(true, []);
  }, [emptyTrashMutation, replaceNotes]);

  const resolveWikilink = useCallback(
    async (target: string, sourceNoteId: string) => {
      const metadata = await resolveWikilinkMutation({ target, sourceNoteId });
      setNote(metadata);

      return metadata.id;
    },
    [resolveWikilinkMutation, setNote]
  );

  const value = useMemo<NotesContextValue>(
    () => ({
      getNote: notesIndex.getNote,
      getChildIds: notesIndex.getChildIds,
      getNotePath: notesIndex.getNotePath,
      createNote,
      createFolder,
      updateNote,
      deleteNote,
      restoreNote,
      emptyTrash,
      resolveWikilink,
      isLoading: treeQuery.isLoading || trashQuery.isLoading,
      error: treeQuery.error ?? trashQuery.error ?? undefined,
    }),
    [
      notesIndex,
      createNote,
      createFolder,
      updateNote,
      deleteNote,
      restoreNote,
      emptyTrash,
      resolveWikilink,
      treeQuery.isLoading,
      trashQuery.isLoading,
      treeQuery.error,
      trashQuery.error,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

/**
 * Access the notes context.
 * Must be used within a NotesProvider.
 */
export function useNotesContext(): NotesContextValue {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }

  return context;
}
