import type { QueryClient } from "@tanstack/react-query";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { noteKeys } from "./query-keys.js";

/** Lists `metadata` in the tree or trash it belongs to, replacing the entry with its id, or `previousId` when it was re-id'd. */
export function upsertNoteQueryData(queryClient: QueryClient, metadata: NoteMetadata, previousId = metadata.id): void {
  queryClient.setQueryData<NoteMetadata[]>(noteKeys.list(metadata.isTrashed), (notes) =>
    notes?.filter((note) => note.id !== previousId && note.id !== metadata.id).concat(metadata)
  );
}

/** Drops a note from the tree and the trash, along with its content. */
export function removeNoteQueryData(queryClient: QueryClient, noteId: string): void {
  queryClient.setQueryData<NoteMetadata[]>(noteKeys.tree(), (notes) => notes?.filter((note) => note.id !== noteId));
  queryClient.setQueryData<NoteMetadata[]>(noteKeys.trash(), (notes) => notes?.filter((note) => note.id !== noteId));
  queryClient.removeQueries({ queryKey: noteKeys.content(noteId) });
}
