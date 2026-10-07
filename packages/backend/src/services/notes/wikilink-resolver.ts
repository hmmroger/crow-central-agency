import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteMetadata,
  type SuggestWikilinksQuery,
  type WikilinkSuggestion,
} from "@crow-central-agency/shared";
import type { WikilinkMatch, WikilinkPlacement, WikilinkSuggestionMatch } from "./wikilink-resolver.types.js";

/** Separates the folder segments and the note name in a wikilink target */
const WIKILINK_TARGET_SEPARATOR = "/";

const RECENT_SUGGESTION_LIMIT = 5;
const MATCH_SUGGESTION_LIMIT = 10;

/**
 * Answers what wikilink targets name in the live note tree, read-only. It holds
 * the live index it was built with, so a replaced index needs a new resolver.
 */
export class WikilinkResolver {
  constructor(private readonly liveIndex: ReadonlyMap<string, NoteMetadata>) {}

  /**
   * The last `/` segment is the note's name and any leading segments end its
   * folder path. A root-anchored match wins; otherwise the first match by path,
   * preferring a note over a folder. Never filters by content type.
   */
  public findNote(target: string): NoteMetadata | undefined {
    const matches = this.findMatches(this.toTargetSegments(target));
    const preferred =
      matches.find((match) => match.isRootAnchored) ??
      matches.find((match) => match.note.entityType !== ENTITY_TYPE.NOTE_FOLDER) ??
      matches[0];

    return preferred?.note;
  }

  /**
   * Where to create the text note an unresolved target names. A bare name goes beside `sourceNote`;
   * a qualified `a/b/name` goes at that path from the notes root, reusing the folders that exist.
   */
  public findPlacement(target: string, sourceNote: NoteMetadata): WikilinkPlacement | undefined {
    const segments = this.toTargetSegments(target);
    const noteName = segments.pop();
    if (noteName === undefined) {
      return undefined;
    }

    if (segments.length === 0) {
      return { parentId: sourceNote.parentId, missingFolderNames: [], noteName };
    }

    let parentId: string | undefined;
    let existingCount = 0;
    for (const folderName of segments) {
      const folder = this.findChildFolder(parentId, folderName);
      if (!folder) {
        break;
      }

      parentId = folder.id;
      existingCount++;
    }

    return { parentId, missingFolderNames: segments.slice(existingCount), noteName };
  }

  /**
   * The shortest target that names exactly `note`: its bare name, qualified with
   * one parent folder at a time until no other note matches. A full path always
   * resolves back to `note` because root-anchored matches win.
   */
  public findShortestTarget(note: NoteMetadata): string {
    const segments = [note.name];
    let parentId = note.parentId;

    while (this.findMatches(segments).length > 1) {
      const parent = parentId === undefined ? undefined : this.liveIndex.get(parentId);
      if (!parent) {
        break;
      }

      segments.unshift(parent.name);
      parentId = parent.parentId;
    }

    return segments.join(WIKILINK_TARGET_SEPARATOR);
  }

  /**
   * The notes `[[` or `![[` offers: every note, or only images for an embed. With no query the
   * most recently updated; otherwise those whose name (or path, for a query with `/`) contains the query,
   * those starting with it first, then the most recent.
   */
  public suggest(query: SuggestWikilinksQuery): WikilinkSuggestion[] {
    const candidates: NoteFileMetadata[] = [];
    for (const metadata of this.liveIndex.values()) {
      if (
        metadata.entityType === ENTITY_TYPE.NOTE &&
        metadata.id !== query.excludeId &&
        (!query.isEmbed || metadata.contentType === NOTE_CONTENT_TYPE.IMAGE)
      ) {
        candidates.push(metadata);
      }
    }

    const needle = this.toComparableName(query.query.trim());
    const notes = needle
      ? this.rankSuggestionMatches(candidates, needle)
      : candidates
          .sort((first, second) => second.updatedTimestamp - first.updatedTimestamp)
          .slice(0, RECENT_SUGGESTION_LIMIT);

    return notes.map((note) => ({
      note,
      folderPath: this.getFolderDisplayPath(note),
      target: this.findShortestTarget(note),
    }));
  }

  /** Every live note `segments` name, in path order. */
  private findMatches(segments: string[]): WikilinkMatch[] {
    const matches: WikilinkMatch[] = [];
    if (segments.length === 0) {
      return matches;
    }

    for (const note of this.liveIndex.values()) {
      const match = this.matchSegments(note, segments);
      if (match) {
        matches.push(match);
      }
    }

    return matches.sort((first, second) => (first.note.path < second.note.path ? -1 : 1));
  }

  /** `note` matches when the last segment is its name and the leading ones end its folder path. */
  private matchSegments(note: NoteMetadata, segments: string[]): WikilinkMatch | undefined {
    const lastIndex = segments.length - 1;
    if (!this.isSameName(note.name, segments[lastIndex])) {
      return undefined;
    }

    let parentId = note.parentId;
    for (let segmentIndex = lastIndex - 1; segmentIndex >= 0; segmentIndex--) {
      const parent = parentId === undefined ? undefined : this.liveIndex.get(parentId);
      if (!parent || !this.isSameName(parent.name, segments[segmentIndex])) {
        return undefined;
      }

      parentId = parent.parentId;
    }

    return { note, isRootAnchored: parentId === undefined };
  }

  private findChildFolder(parentId: string | undefined, name: string): NoteMetadata | undefined {
    for (const metadata of this.liveIndex.values()) {
      if (
        metadata.entityType === ENTITY_TYPE.NOTE_FOLDER &&
        metadata.parentId === parentId &&
        this.isSameName(metadata.name, name)
      ) {
        return metadata;
      }
    }

    return undefined;
  }

  /** The folders above `note`, outermost first, or `undefined` at the notes root. */
  private getFolderDisplayPath(note: NoteMetadata): string | undefined {
    const folderNames: string[] = [];
    let parentId = note.parentId;

    while (parentId !== undefined) {
      const parent = this.liveIndex.get(parentId);
      if (!parent) {
        break;
      }

      folderNames.unshift(parent.name);
      parentId = parent.parentId;
    }

    return folderNames.length > 0 ? folderNames.join(WIKILINK_TARGET_SEPARATOR) : undefined;
  }

  /** A needle with a `/` matches against the folder path too, so `trip/pl` narrows to notes in `trip`. */
  private rankSuggestionMatches(candidates: NoteFileMetadata[], needle: string): NoteFileMetadata[] {
    const isPathQuery = needle.includes(WIKILINK_TARGET_SEPARATOR);
    const matches: WikilinkSuggestionMatch[] = [];
    for (const note of candidates) {
      const folderPath = isPathQuery ? this.getFolderDisplayPath(note) : undefined;
      const text = this.toComparableName(
        folderPath === undefined ? note.name : `${folderPath}${WIKILINK_TARGET_SEPARATOR}${note.name}`
      );
      if (text.includes(needle)) {
        matches.push({ note, isPrefix: text.startsWith(needle) });
      }
    }

    return matches
      .sort(
        (first, second) =>
          Number(second.isPrefix) - Number(first.isPrefix) || second.note.updatedTimestamp - first.note.updatedTimestamp
      )
      .slice(0, MATCH_SUGGESTION_LIMIT)
      .map((match) => match.note);
  }

  /** The form note names compare in; names match case-insensitively. */
  private toComparableName(name: string): string {
    return name.toLowerCase();
  }

  private isSameName(name: string, otherName: string): boolean {
    return this.toComparableName(name) === this.toComparableName(otherName);
  }

  /** A wikilink target's `/`-separated segments, blank ones dropped; the last is the note's name. */
  private toTargetSegments(target: string): string[] {
    return target
      .split(WIKILINK_TARGET_SEPARATOR)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }
}
