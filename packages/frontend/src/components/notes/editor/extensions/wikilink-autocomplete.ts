import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import {
  ENTITY_TYPE,
  escapeWikilinkTarget,
  NOTE_CONTENT_TYPE,
  unescapeWikilinkTarget,
  WIKILINK_TARGET_CHAR_SOURCE,
  type NoteFileMetadata,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { toShortestWikilinkTarget } from "../../../../utils/wikilink-resolver.js";
import { getCurrentNoteId } from "./current-note-state.js";
import { getNotesTree } from "./notes-tree-state.js";
import type { WikilinkSuggestionMatch, WikilinkSuggestionQuery } from "./wikilink-autocomplete.types.js";

/** `[[` or `![[` and the target typed so far, up to the cursor. */
const OPEN_WIKILINK_PATTERN = new RegExp(String.raw`!?\[\[${WIKILINK_TARGET_CHAR_SOURCE}*$`);
const EMBED_PREFIX = "!";
const OPEN_MARK = "[[";
const CLOSE_MARK = "]]";
const FOLDER_SEPARATOR = "/";
const RECENT_LIMIT = 5;
const MATCH_LIMIT = 10;
const CODE_SYNTAX_NODES = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
]);

function isSuggestable(metadata: NoteMetadata, query: WikilinkSuggestionQuery): metadata is NoteFileMetadata {
  return (
    metadata.entityType === ENTITY_TYPE.NOTE &&
    metadata.id !== query.currentNoteId &&
    (!query.isEmbed || metadata.contentType === NOTE_CONTENT_TYPE.IMAGE)
  );
}

function byMostRecent(first: NoteMetadata, second: NoteMetadata): number {
  return second.updatedTimestamp - first.updatedTimestamp;
}

/** The folders above `note`, outermost first, or `undefined` at the notes root. */
function toFolderPath(metadataById: Map<string, NoteMetadata>, note: NoteMetadata): string | undefined {
  const folderNames: string[] = [];
  let parentId = note.parentId;

  while (parentId !== undefined) {
    const parent = metadataById.get(parentId);

    if (!parent) {
      break;
    }

    folderNames.unshift(parent.name);
    parentId = parent.parentId;
  }

  return folderNames.length > 0 ? folderNames.join(FOLDER_SEPARATOR) : undefined;
}

/** A query with a `/` matches against the folder path too, so `trip/pl` narrows to notes in `trip`. */
function toSearchText(metadataById: Map<string, NoteMetadata>, note: NoteMetadata, query: string): string {
  const folderPath = query.includes(FOLDER_SEPARATOR) ? toFolderPath(metadataById, note) : undefined;

  return (folderPath === undefined ? note.name : `${folderPath}${FOLDER_SEPARATOR}${note.name}`).toLowerCase();
}

function byPrefixThenMostRecent(first: WikilinkSuggestionMatch, second: WikilinkSuggestionMatch): number {
  return Number(second.isPrefix) - Number(first.isPrefix) || byMostRecent(first.note, second.note);
}

/**
 * The notes `[[` or `![[` offers: with no query the most recently updated, otherwise the notes whose name
 * (or path, for a query with `/`) contains the query, those starting with it first, then the most recent.
 */
export function selectWikilinkSuggestions(notes: NoteMetadata[], query: WikilinkSuggestionQuery): NoteFileMetadata[] {
  const candidates = notes.filter((metadata) => isSuggestable(metadata, query));
  const needle = query.query.trim().toLowerCase();

  if (!needle) {
    return candidates.sort(byMostRecent).slice(0, RECENT_LIMIT);
  }

  const metadataById = new Map(notes.map((metadata) => [metadata.id, metadata]));
  const matches: WikilinkSuggestionMatch[] = [];

  for (const note of candidates) {
    const text = toSearchText(metadataById, note, needle);

    if (text.includes(needle)) {
      matches.push({ note, isPrefix: text.startsWith(needle) });
    }
  }

  return matches
    .sort(byPrefixThenMostRecent)
    .slice(0, MATCH_LIMIT)
    .map((match) => match.note);
}

/** Shows the note's name and folder; applying it writes the shortest target that names it, escaped. */
export function toWikilinkCompletion(notes: NoteMetadata[], note: NoteMetadata): Completion {
  const metadataById = new Map(notes.map((metadata) => [metadata.id, metadata]));

  return {
    label: note.name,
    detail: toFolderPath(metadataById, note),
    apply: `${OPEN_MARK}${escapeWikilinkTarget(toShortestWikilinkTarget(notes, note))}${CLOSE_MARK}`,
  };
}

function isInCode(state: EditorState, position: number): boolean {
  for (
    let current: SyntaxNode | null = syntaxTree(state).resolveInner(position, -1);
    current;
    current = current.parent
  ) {
    if (CODE_SYNTAX_NODES.has(current.name)) {
      return true;
    }
  }

  return false;
}

/** Replaces from `[[` (keeping an embed's `!`) through the cursor, and a `]]` right after it. */
export function completeWikilink(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(OPEN_WIKILINK_PATTERN);

  if (!match || isInCode(context.state, context.pos)) {
    return null;
  }

  const isEmbed = match.text.startsWith(EMBED_PREFIX);
  const from = isEmbed ? match.from + EMBED_PREFIX.length : match.from;
  const { state, pos } = context;
  const notes = getNotesTree(state);
  const suggestions = selectWikilinkSuggestions(notes, {
    query: unescapeWikilinkTarget(state.sliceDoc(from + OPEN_MARK.length, pos)),
    isEmbed,
    currentNoteId: getCurrentNoteId(state),
  });

  return {
    from,
    to: state.sliceDoc(pos, pos + CLOSE_MARK.length) === CLOSE_MARK ? pos + CLOSE_MARK.length : pos,
    options: suggestions.map((note) => toWikilinkCompletion(notes, note)),
    filter: false,
  };
}

/** Suggests notes from the notes tree after `[[` and image notes after `![[`, never inside code. */
export function wikilinkAutocomplete(): Extension {
  return autocompletion({ override: [completeWikilink], icons: false });
}
