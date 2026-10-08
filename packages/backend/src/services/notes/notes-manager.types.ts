import type { NoteFileMetadata, NoteMetadata } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

/**
 * Note lifecycle events for backend listeners such as search, live and trash
 * alike. Each is raised together with the matching WS message and carries the
 * same payload; a note's event comes after its tag work.
 */
export interface NotesManagerEvents extends EventMap {
  noteCreated: { noteId: string; metadata: NoteMetadata };
  noteUpdated: { noteId: string; metadata: NoteMetadata };
  noteDeleted: { noteId: string };
}

/** Content of a single note: a string for text notes, raw bytes otherwise. */
export interface ReadNoteResult {
  metadata: NoteFileMetadata;
  content: string | Buffer;
}

export interface CreateNoteOptions {
  /** The folder the note is created in; the notes root when omitted */
  parentId?: string;
}

export interface ListNotesOptions {
  /** The folder to list; the tree root when omitted */
  parentId?: string;
  /** List everything under the folder instead of its direct children */
  isRecursive?: boolean;
}

/** What one parse of a text note yields; each token kind the notes collection uses is a field */
export interface ParsedNoteContent {
  /** Hashtags of the note's tag lines, without `#` */
  tags: string[];
}

/** What one walk of a note tree yields; text notes are read and parsed during the walk when `isContentParsed` */
export interface NoteTreeScan {
  walkPath: string;
  isContentParsed: boolean;
  index: Map<string, NoteMetadata>;
  parsedContentByNoteId: Map<string, ParsedNoteContent>;
}

/** Where a new note would land; the caller checks the id and guards the path before writing. */
export interface ResolvedNotePath {
  id: string;
  relativePath: string;
  absolutePath: string;
}
