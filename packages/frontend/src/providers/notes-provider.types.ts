import type { NoteMetadata, UpdateNoteInput } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

export interface NoteListStatus {
  isLoading: boolean;
  error: ApiError | undefined;
}

/** Value exposed by the NotesProvider context: note accessors and operations, never the lists themselves */
export interface NotesContextValue {
  getNote: (noteId: string) => NoteMetadata | undefined;
  /** Ids of the live or trashed notes directly under `parentId`, or at the root when it is undefined */
  getChildIds: (parentId: string | undefined, isTrashed: boolean) => string[];
  /** Ids of the note's ancestor folders, root first, excluding the note */
  getAncestorIds: (noteId: string) => string[];
  /** Load state of the live or the trash list */
  getListStatus: (isTrashed: boolean) => NoteListStatus;
  /** Resolves with the new note's id */
  createNote: (parentId: string | undefined, name: string) => Promise<string>;
  /** Resolves with the new folder's id */
  createFolder: (parentId: string | undefined, name: string) => Promise<string>;
  /** Rename and/or move a note; resolves with its id, which changes with its path */
  updateNote: (noteId: string, input: UpdateNoteInput) => Promise<string>;
  /** Moves a live note to the trash, or removes a trashed one for good */
  deleteNote: (noteId: string) => Promise<void>;
  /** Resolves with the restored note's live id */
  restoreNote: (noteId: string) => Promise<string>;
  emptyTrash: () => Promise<void>;
  /** Resolves with the id of the note a wikilink names, created beside the source note when it names nothing yet */
  resolveWikilink: (target: string, sourceNoteId: string) => Promise<string>;
}
