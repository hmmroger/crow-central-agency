import type { NoteFileMetadata, NoteFolderMetadata, NoteMetadata } from "@crow-central-agency/shared";
import type { EventMap } from "../../core/event-bus/event-bus.types.js";

/**
 * Live-tree lifecycle events, raised once an operation's index update and tag
 * work are done, consumed by the search index. The trash raises none; WS
 * broadcasts are sent inline through the injected broadcaster.
 */
export interface NotesManagerEvents extends EventMap {
  noteCreated: { metadata: NoteMetadata };
  noteUpdated: { metadata: NoteMetadata };
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

/** The folders down to a path, indexed after a move */
export interface IndexedFolderChain {
  /** The innermost folder, or undefined at a tree root */
  parentId?: string;
  /** The folders the move created, outermost first */
  createdFolders: NoteFolderMetadata[];
}

/** Where a new note would land; the caller checks the id and guards the path before writing. */
export interface ResolvedNotePath {
  id: string;
  relativePath: string;
  absolutePath: string;
}
