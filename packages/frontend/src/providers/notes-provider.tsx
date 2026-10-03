import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SERVER_MESSAGE_TYPE, type NoteMetadata } from "@crow-central-agency/shared";
import { removeNoteQueryData, upsertNoteQueryData } from "../services/note-query-data.js";
import { noteKeys } from "../services/query-keys.js";
import { WS_STATE } from "../services/ws-client.types.js";
import { useWs } from "../hooks/use-ws.js";

/**
 * Keeps the note caches in step with `note_created` / `note_updated` / `note_deleted` WS events,
 * and refetches them when the WS recovers from a disconnect.
 */
export function NotesProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.NOTE_CREATED) {
        upsertNoteQueryData(queryClient, message.metadata);
        void queryClient.invalidateQueries({ queryKey: noteKeys.links() });

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.NOTE_UPDATED) {
        const { noteId, metadata } = message;
        const previous = queryClient
          .getQueryData<NoteMetadata[]>(noteKeys.list(metadata.isTrashed))
          ?.find((note) => note.id === noteId);
        upsertNoteQueryData(queryClient, metadata);
        if (previous?.name !== metadata.name || previous.path !== metadata.path) {
          void queryClient.invalidateQueries({ queryKey: noteKeys.links() });
        }

        return;
      }

      if (message.type === SERVER_MESSAGE_TYPE.NOTE_DELETED) {
        removeNoteQueryData(queryClient, message.noteId);
        void queryClient.invalidateQueries({ queryKey: noteKeys.links() });
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

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

  return children;
}
