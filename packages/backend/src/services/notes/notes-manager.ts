import fs from "node:fs/promises";
import path from "node:path";
import {
  ENTITY_TYPE,
  getExtensionByMimeType,
  isImageFileExtension,
  NOTE_CONTENT_TYPE,
  NOTE_IMAGE_ASSET_MIME_TYPES,
  NOTE_NAME_MAX_LENGTH,
  SERVER_MESSAGE_TYPE,
  type NoteContentType,
  type NoteEntityType,
  type NoteFileMetadata,
  type NoteFolderMetadata,
  type NoteImageAsset,
  type NoteMetadata,
  type SuggestWikilinksQuery,
  type UpdateNoteInput,
  type WikilinkResolution,
  type WikilinkSuggestion,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { isAppErrorCode } from "../../core/error/app-error-utils.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import {
  assertRealPathWithinBase,
  assertWithinBase,
  deleteFile,
  ensureDir,
  getPathStats,
  isPathExists,
  mergeMove,
  readBinaryFile,
  readTextFile,
  removeDir,
  removeEmptyAncestors,
  renameFile,
  statFile,
  writeBinaryFile,
  writeTextFile,
} from "../../utils/fs-utils.js";
import { logger } from "../../utils/logger.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import type {
  ReadNoteResult,
  ResolvedNotePath,
  WikilinkMatch,
  WikilinkPlacement,
  WikilinkSuggestionMatch,
} from "./notes-manager.types.js";

const log = logger.child({ context: "notes-manager" });

/** Extension of every note created in the app; text notes are markdown */
const MARKDOWN_EXTENSION = ".md";

/** Mirror of the live tree holding deleted notes at their original relative paths */
const TRASH_DIRECTORY = ".trash";

/** Replaces the path separator in a note id — invalid in filenames, so it cannot collide */
const NOTE_ID_SEPARATOR = ":";

/** Separates the folder segments and the note name in a wikilink target */
const WIKILINK_TARGET_SEPARATOR = "/";

/** Characters that are invalid in a filename on at least one supported platform */
const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*]/;

const FIRST_PRINTABLE_CHARACTER_CODE = 0x20;
const DELETE_CHARACTER_CODE = 0x7f;

/** Folder created beside a note to hold the files pasted into it */
const NOTE_ASSETS_FOLDER_NAME = "assets";

const IMAGE_ASSET_PREFIX = "image";
const DATE_PART_LENGTH = 2;

/** Bounds the `-n` suffix search for images saved in the same second */
const MAX_ASSET_NAME_ATTEMPTS = 100;

const RECENT_SUGGESTION_LIMIT = 5;
const MATCH_SUGGESTION_LIMIT = 10;

/**
 * Manages the user's note tree, stored as plain files under the notes root.
 * A file is a note, a directory is a folder, and the in-memory index is a pure
 * cache rebuilt from disk — identity, title and content always come from the
 * filesystem. Every path resolution is confined to the notes root.
 *
 * Live and trashed notes are held in two indexes that never merge, but every id
 * derives from the same notes-root-relative path, so a trashed note's id is its
 * original prefixed with `.trash:` — unique across both.
 */
export class NotesManager {
  private readonly notesPath: string;
  private readonly trashPath: string;
  private index = new Map<string, NoteMetadata>();
  private trashIndex = new Map<string, NoteMetadata>();

  constructor(
    notesPath: string,
    private readonly broadcaster: WsBroadcaster
  ) {
    this.notesPath = notesPath;
    this.trashPath = path.join(notesPath, TRASH_DIRECTORY);
  }

  /** Ensure the notes root exists and build both indexes from disk. */
  public async initialize(): Promise<void> {
    await ensureDir(this.notesPath);
    await this.loadIndexes();
  }

  /** The live note tree as a flat list; consumers compose it via `parentId`. */
  public getTree(): NoteMetadata[] {
    return Array.from(this.index.values());
  }

  /** The trash tree as a flat list. Its ids carry the `.trash:` prefix of their path. */
  public getTrashTree(): NoteMetadata[] {
    return Array.from(this.trashIndex.values());
  }

  /**
   * A note from either tree. Ids are unique across both, so the lookup resolves
   * to exactly one note wherever it lives; `isReadOnly` is what refuses a write
   * to a trashed one, so reading it stays available.
   * @throws AppError NOT_FOUND when the id is not indexed.
   */
  public getNote(id: string): NoteMetadata {
    const metadata = this.index.get(id) ?? this.trashIndex.get(id);
    if (!metadata) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return metadata;
  }

  /**
   * Read a note's content, live or trashed — deleting a note revokes editing,
   * not reading. Text notes come back as a string, image and unknown notes as
   * raw bytes for the caller to stream.
   * @throws AppError NOT_FOUND when the id is not indexed, NOT_SUPPORTED when
   * it names a folder.
   */
  public async getNoteContent(id: string): Promise<ReadNoteResult> {
    const metadata = this.getNote(id);
    if (metadata.entityType !== ENTITY_TYPE.NOTE) {
      throw new AppError(`Not a readable note: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const notePath = this.resolvePath(metadata.path);
    const content =
      metadata.contentType === NOTE_CONTENT_TYPE.TEXT ? await readTextFile(notePath) : await readBinaryFile(notePath);

    return { metadata, content };
  }

  /**
   * Create a folder under `parentId`, or at the notes root when it is undefined.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT on a colliding id.
   */
  public async createFolder(parentId: string | undefined, name: string): Promise<NoteMetadata> {
    const target = await this.resolveNewTarget(parentId, name, name);
    return this.createDirectoryEntry(target, parentId);
  }

  /**
   * Create a markdown note named `<name>.md` under `parentId`.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT on a colliding id.
   */
  public async createTextNote(parentId: string | undefined, name: string, content = ""): Promise<NoteMetadata> {
    const target = await this.resolveNewTarget(parentId, name, `${name}${MARKDOWN_EXTENSION}`);
    if (!(await writeTextFile(target.absolutePath, content, { overwrite: false }))) {
      await this.indexEntry(target, parentId);

      throw new AppError(`A note or folder with id "${target.id}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    return this.requireIndexedEntry(target, parentId);
  }

  /** What each target names in the live tree; never creates. */
  public resolveWikilinkBatch(targets: string[]): WikilinkResolution[] {
    return targets.map((target) => ({ target, note: this.findWikilinkNote(target) }));
  }

  /**
   * The note `target` names, created when it names nothing: a bare name beside
   * the source note, `a/b/name` from the notes root with any missing folders.
   * A create that loses a race looks the note up, so repeated calls return the same note.
   * @throws AppError VALIDATION when the target is blank or names a folder.
   */
  public async resolveWikilink(target: string, sourceNoteId: string): Promise<NoteMetadata> {
    const existing = this.findWikilinkNote(target);
    if (existing?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      throw new AppError(`"${target}" names a folder, not a note`, APP_ERROR_CODES.VALIDATION);
    }

    if (existing) {
      return existing;
    }

    const placement = this.toWikilinkPlacement(target, this.requireLiveNote(sourceNoteId));
    if (!placement) {
      throw new AppError("A link needs a note name", APP_ERROR_CODES.VALIDATION);
    }

    let parentId = placement.parentId;
    for (const folderName of placement.missingFolderNames) {
      parentId = (await this.ensureFolder(parentId, folderName)).id;
    }

    try {
      return await this.createTextNote(parentId, placement.noteName);
    } catch (error) {
      if (!isAppErrorCode(error, APP_ERROR_CODES.CONFLICT)) {
        throw error;
      }

      const created = this.findWikilinkNote(target);
      if (created?.entityType !== ENTITY_TYPE.NOTE) {
        throw error;
      }

      return created;
    }
  }

  /**
   * The notes `[[` or `![[` offers: every note, or only images for an embed. With no query the
   * most recently updated; otherwise those whose name (or path, for a query with `/`) contains the query,
   * those starting with it first, then the most recent.
   */
  public suggestWikilinks(query: SuggestWikilinksQuery): WikilinkSuggestion[] {
    const candidates: NoteFileMetadata[] = [];
    for (const metadata of this.index.values()) {
      if (
        metadata.entityType === ENTITY_TYPE.NOTE &&
        metadata.id !== query.excludeId &&
        (!query.isEmbed || metadata.contentType === NOTE_CONTENT_TYPE.IMAGE)
      ) {
        candidates.push(metadata);
      }
    }

    const needle = this.toComparableNoteName(query.query.trim());
    const notes = needle
      ? this.rankSuggestionMatches(candidates, needle)
      : candidates
          .sort((first, second) => second.updatedTimestamp - first.updatedTimestamp)
          .slice(0, RECENT_SUGGESTION_LIMIT);

    return notes.map((note) => ({
      note,
      folderPath: this.toFolderPath(note),
      target: this.toShortestWikilinkTarget(note),
    }));
  }

  /** Every live folder a note may move into: all but the note itself and its descendants. */
  public getMoveDestinations(id: string): NoteFolderMetadata[] {
    const note = this.requireLiveNote(id);
    const destinations: NoteFolderMetadata[] = [];
    for (const metadata of this.index.values()) {
      if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER && !this.isWithinRelativePath(metadata.path, note.path)) {
        destinations.push(metadata);
      }
    }

    return destinations;
  }

  /**
   * Save an image into the `assets` folder beside a text note, under a
   * server-generated `image-YYYYMMDD-HHMMSS` name; nothing the client sends
   * reaches the filesystem except the bytes. Returns the new note with the
   * shortest target that embeds it.
   * @throws AppError NOT_SUPPORTED when the id names a folder or a read-only
   * note, VALIDATION when the MIME type is not an accepted image type.
   */
  public async createImageAsset(noteId: string, mimeType: string, content: Buffer): Promise<NoteImageAsset> {
    const metadata = this.getNote(noteId);
    if (metadata.entityType !== ENTITY_TYPE.NOTE || metadata.isReadOnly) {
      throw new AppError(`Images can only be added to an editable note: ${noteId}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const extension = this.toImageAssetExtension(mimeType);
    if (!extension) {
      throw new AppError(`Unsupported image type: ${mimeType}`, APP_ERROR_CODES.VALIDATION);
    }

    const assetsFolder = await this.ensureAssetsFolder(metadata.parentId);
    const createdAt = new Date();
    for (let attempt = 0; attempt < MAX_ASSET_NAME_ATTEMPTS; attempt++) {
      const target = this.toNewTarget(assetsFolder.path, this.toImageAssetFilename(createdAt, extension, attempt));
      if (this.index.has(target.id)) {
        continue;
      }

      await assertRealPathWithinBase(target.absolutePath, this.notesPath);
      if (await writeBinaryFile(target.absolutePath, content, { overwrite: false })) {
        const note = await this.requireIndexedEntry(target, assetsFolder.id);

        return { note, target: this.toShortestWikilinkTarget(note) };
      }

      await this.indexEntry(target, assetsFolder.id);
    }

    throw new AppError(`No free image name left in "${assetsFolder.path}"`, APP_ERROR_CODES.CONFLICT);
  }

  /**
   * Replace a text note's content. `updatedTimestamp` is the token from the
   * last read or write; the returned metadata carries the token for the next.
   * @throws AppError NOT_SUPPORTED when the id names a folder or the note is
   * read-only (a trashed, image or unknown note), CONFLICT when the token no
   * longer matches disk.
   */
  public async writeNoteContent(id: string, content: string, updatedTimestamp: number): Promise<NoteFileMetadata> {
    const metadata = this.getNote(id);
    if (metadata.entityType !== ENTITY_TYPE.NOTE) {
      throw new AppError(`Not a writable note: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    if (metadata.isReadOnly) {
      throw new AppError(`Note is not editable: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const notePath = this.resolvePath(metadata.path);
    const stats = await statFile(notePath);
    if (this.toUpdatedTimestamp(stats.mtimeMs) !== updatedTimestamp) {
      throw new AppError(`Note changed on disk since it was loaded: ${id}`, APP_ERROR_CODES.CONFLICT);
    }

    await writeTextFile(notePath, content);
    const updated = await this.buildNoteMetadata(notePath, path.basename(metadata.path), metadata.parentId);
    this.index.set(updated.id, updated);
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_UPDATED, noteId: updated.id, metadata: updated });

    return updated;
  }

  /**
   * Rename and/or move a live note. An omitted field is unchanged; a `null`
   * `parentId` moves the note to the notes root.
   * @throws AppError CONFLICT when the destination id is taken,
   * NOT_SUPPORTED when the note is in the trash.
   */
  public async renameOrMove(id: string, update: UpdateNoteInput): Promise<NoteMetadata> {
    if (this.trashIndex.has(id)) {
      throw new AppError(`A trashed note is restored, not moved: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const metadata = this.requireLiveNote(id);
    const name = update.name ?? metadata.name;
    const isFolder = metadata.entityType === ENTITY_TYPE.NOTE_FOLDER;
    const filename = isFolder ? name : this.toRenamedNoteFilename(path.basename(metadata.path), name);
    const nextParentId = update.parentId === undefined ? metadata.parentId : (update.parentId ?? undefined);
    const nextRelativePath = path.join(this.requireFolderPath(nextParentId), filename);
    if (nextRelativePath === metadata.path) {
      return metadata;
    }

    this.assertValidNoteName(name);

    if (isFolder && this.isWithinRelativePath(nextRelativePath, metadata.path)) {
      throw new AppError(`A folder cannot be moved into itself: ${id}`, APP_ERROR_CODES.VALIDATION);
    }

    const nextId = this.toNoteId(nextRelativePath);
    if (nextId !== id && this.index.has(nextId)) {
      throw new AppError(`A note or folder with id "${nextId}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    const nextAbsolutePath = path.join(this.notesPath, nextRelativePath);
    await assertRealPathWithinBase(nextAbsolutePath, this.notesPath);

    const renamed = await renameFile(this.resolvePath(metadata.path), nextAbsolutePath);
    if (!renamed) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return this.reindexAndGet(nextId);
  }

  /**
   * Delete by location: a live note moves into the trash at its original
   * relative path, cascading through a folder's subtree, and a note that is
   * already trashed is removed for good. An earlier trashed copy of the same
   * path is overwritten, while its trashed siblings are kept.
   */
  public async deleteNote(id: string): Promise<void> {
    const metadata = this.index.get(id);
    if (metadata === undefined) {
      if (!this.trashIndex.has(id)) {
        throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
      }

      return this.purgeNote(id);
    }

    const sourcePath = this.resolvePath(metadata.path);
    const targetPath = path.join(this.trashPath, metadata.path);

    // The guard resolves symlinks, so it runs once the parent chain it has to
    // resolve exists.
    await ensureDir(path.dirname(targetPath));
    await assertRealPathWithinBase(targetPath, this.notesPath);
    await mergeMove(sourcePath, targetPath);

    await this.rebuildIndexes();
  }

  /**
   * Move a trashed note back to its original path, recreating the live folders
   * it needs. A restored folder merges into a live folder of the same name.
   * @throws AppError CONFLICT when the note, or any file inside it, is live again.
   */
  public async restoreNote(id: string): Promise<NoteMetadata> {
    const metadata = this.requireTrashedNote(id);
    const sourcePath = this.resolvePath(metadata.path);
    const restoredPath = path.relative(TRASH_DIRECTORY, metadata.path);
    const targetPath = path.join(this.notesPath, restoredPath);

    await this.assertRestorable(sourcePath, targetPath);
    await ensureDir(path.dirname(targetPath));
    await assertRealPathWithinBase(targetPath, this.notesPath);
    await mergeMove(sourcePath, targetPath);
    await removeEmptyAncestors(path.dirname(sourcePath), this.trashPath);

    await this.rebuildIndexes();

    return this.requireLiveNote(this.toNoteId(restoredPath));
  }

  /** Permanently remove everything in the trash. */
  public async emptyTrash(): Promise<void> {
    await removeDir(this.trashPath);
    await this.rebuildTrashIndex();
  }

  /** Permanently remove a single trashed note. */
  private async purgeNote(id: string): Promise<void> {
    const metadata = this.requireTrashedNote(id);
    const targetPath = this.resolvePath(metadata.path);

    if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      await removeDir(targetPath);
    } else {
      await deleteFile(targetPath);
    }

    await removeEmptyAncestors(path.dirname(targetPath), this.trashPath);
    await this.rebuildTrashIndex();
  }

  /**
   * Refuse a restore that would overwrite live content. A trashed folder may
   * merge into a live folder, but never onto a live file, and no file it
   * carries may land on one.
   */
  private async assertRestorable(sourcePath: string, targetPath: string): Promise<void> {
    const targetStats = await getPathStats(targetPath);
    if (targetStats === undefined) {
      return;
    }

    const sourceStats = await statFile(sourcePath);
    if (!sourceStats.isDirectory() || !targetStats.isDirectory()) {
      const relativePath = path.relative(this.notesPath, targetPath);

      throw new AppError(`Cannot restore, "${relativePath}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await this.assertRestorable(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
    }
  }

  private requireTrashedNote(id: string): NoteMetadata {
    const metadata = this.trashIndex.get(id);
    if (!metadata) {
      throw new AppError(`Trashed note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return metadata;
  }

  /** A note the live tree still holds, for the operations the trash has no answer for. */
  private requireLiveNote(id: string): NoteMetadata {
    const metadata = this.index.get(id);
    if (!metadata) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return metadata;
  }

  /** Relative path of the folder new notes land in; empty for the notes root. */
  private requireFolderPath(parentId: string | undefined): string {
    if (!parentId) {
      return "";
    }

    const parent = this.requireLiveNote(parentId);
    if (parent.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      throw new AppError(`Not a folder: ${parentId}`, APP_ERROR_CODES.VALIDATION);
    }

    return parent.path;
  }

  /** Validate a user-supplied name and resolve where the new note goes. */
  private async resolveNewTarget(
    parentId: string | undefined,
    name: string,
    filename: string
  ): Promise<ResolvedNotePath> {
    this.assertValidNoteName(name);

    const target = this.toNewTarget(this.requireFolderPath(parentId), filename);
    if (this.index.has(target.id)) {
      throw new AppError(`A note or folder with id "${target.id}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    await assertRealPathWithinBase(target.absolutePath, this.notesPath);

    return target;
  }

  /** Where `filename` lands inside `folderPath`; the caller checks the id and guards the path. */
  private toNewTarget(folderPath: string, filename: string): ResolvedNotePath {
    const relativePath = path.join(folderPath, filename);

    return { id: this.toNoteId(relativePath), relativePath, absolutePath: path.join(this.notesPath, relativePath) };
  }

  /**
   * The `assets` folder beside a note, created when missing.
   * @throws AppError CONFLICT when a file already holds the folder's name.
   */
  private async ensureAssetsFolder(parentId: string | undefined): Promise<NoteMetadata> {
    const folder = this.toNewTarget(this.requireFolderPath(parentId), NOTE_ASSETS_FOLDER_NAME);
    const existing = this.index.get(folder.id);
    if (existing && existing.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      throw new AppError(`"${existing.path}" is a file, not an assets folder`, APP_ERROR_CODES.CONFLICT);
    }

    await assertRealPathWithinBase(folder.absolutePath, this.notesPath);

    return this.createDirectoryEntry(folder, parentId);
  }

  /**
   * Create the folder at `target` and index it.
   * @throws AppError CONFLICT when something other than a folder already holds the path.
   */
  private async createDirectoryEntry(target: ResolvedNotePath, parentId: string | undefined): Promise<NoteMetadata> {
    const stats = await getPathStats(target.absolutePath);
    if (stats && !stats.isDirectory()) {
      await this.indexEntry(target, parentId);

      throw new AppError(`A note or folder with id "${target.id}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    await ensureDir(target.absolutePath);

    return this.requireIndexedEntry(target, parentId);
  }

  /**
   * The indexed entry at `target`, indexing that one path when it is on disk
   * but not in the index yet; `undefined` when neither holds it.
   */
  private async indexEntry(target: ResolvedNotePath, parentId: string | undefined): Promise<NoteMetadata | undefined> {
    const indexed = this.index.get(target.id);
    if (indexed) {
      return indexed;
    }

    const stats = await getPathStats(target.absolutePath);
    const entryName = path.basename(target.relativePath);
    let metadata: NoteMetadata | undefined;
    if (stats?.isDirectory()) {
      metadata = await this.buildFolderMetadata(target.absolutePath, entryName, parentId);
    } else if (stats?.isFile()) {
      metadata = await this.buildNoteMetadata(target.absolutePath, entryName, parentId);
    }

    const current = this.index.get(target.id);
    if (current || !metadata) {
      return current;
    }

    this.index.set(metadata.id, metadata);
    this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_CREATED, noteId: metadata.id, metadata });

    return metadata;
  }

  private async requireIndexedEntry(target: ResolvedNotePath, parentId: string | undefined): Promise<NoteMetadata> {
    const metadata = await this.indexEntry(target, parentId);
    if (!metadata) {
      throw new AppError(`Note not found: ${target.id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    return metadata;
  }

  /** Whether `candidatePath` is `ancestorPath` itself or sits underneath it */
  private isWithinRelativePath(candidatePath: string, ancestorPath: string): boolean {
    return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + path.sep);
  }

  /** mtime carries sub-millisecond precision that would not survive a round trip through JSON */
  private toUpdatedTimestamp(mtimeMs: number): number {
    return Math.trunc(mtimeMs);
  }

  /** A structural change re-keys descendants, so the index is rebuilt rather than patched. */
  private async reindexAndGet(id: string): Promise<NoteMetadata> {
    await this.rebuildIndexes();

    return this.requireLiveNote(id);
  }

  /**
   * The last `/` segment is the note's name and any leading segments end its
   * folder path. A root-anchored match wins; otherwise the first match by path,
   * preferring a note over a folder. Never filters by content type.
   */
  private findWikilinkNote(target: string): NoteMetadata | undefined {
    const matches = this.findWikilinkMatches(this.toWikilinkTargetSegments(target));
    const preferred =
      matches.find((match) => match.isRootAnchored) ??
      matches.find((match) => match.note.entityType !== ENTITY_TYPE.NOTE_FOLDER) ??
      matches[0];

    return preferred?.note;
  }

  /** Every live note `segments` name, in path order. */
  private findWikilinkMatches(segments: string[]): WikilinkMatch[] {
    const matches: WikilinkMatch[] = [];
    if (segments.length === 0) {
      return matches;
    }

    for (const note of this.index.values()) {
      const match = this.matchWikilinkSegments(note, segments);
      if (match) {
        matches.push(match);
      }
    }

    return matches.sort((first, second) => (first.note.path < second.note.path ? -1 : 1));
  }

  /** `note` matches when the last segment is its name and the leading ones end its folder path. */
  private matchWikilinkSegments(note: NoteMetadata, segments: string[]): WikilinkMatch | undefined {
    const lastIndex = segments.length - 1;
    if (!this.isSameNoteName(note.name, segments[lastIndex])) {
      return undefined;
    }

    let parentId = note.parentId;
    for (let segmentIndex = lastIndex - 1; segmentIndex >= 0; segmentIndex--) {
      const parent = parentId === undefined ? undefined : this.index.get(parentId);
      if (!parent || !this.isSameNoteName(parent.name, segments[segmentIndex])) {
        return undefined;
      }

      parentId = parent.parentId;
    }

    return { note, isRootAnchored: parentId === undefined };
  }

  /**
   * The shortest target that names exactly `note`: its bare name, qualified with
   * one parent folder at a time until no other note matches. A full path always
   * resolves back to `note` because root-anchored matches win.
   */
  private toShortestWikilinkTarget(note: NoteMetadata): string {
    const segments = [note.name];
    let parentId = note.parentId;

    while (this.findWikilinkMatches(segments).length > 1) {
      const parent = parentId === undefined ? undefined : this.index.get(parentId);
      if (!parent) {
        break;
      }

      segments.unshift(parent.name);
      parentId = parent.parentId;
    }

    return segments.join(WIKILINK_TARGET_SEPARATOR);
  }

  /**
   * Where to create the text note an unresolved target names. A bare name goes beside `sourceNote`;
   * a qualified `a/b/name` goes at that path from the notes root, reusing the folders that exist.
   */
  private toWikilinkPlacement(target: string, sourceNote: NoteMetadata): WikilinkPlacement | undefined {
    const segments = this.toWikilinkTargetSegments(target);
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

  private findChildFolder(parentId: string | undefined, name: string): NoteMetadata | undefined {
    for (const metadata of this.index.values()) {
      if (
        metadata.entityType === ENTITY_TYPE.NOTE_FOLDER &&
        metadata.parentId === parentId &&
        this.isSameNoteName(metadata.name, name)
      ) {
        return metadata;
      }
    }

    return undefined;
  }

  /** The folders above `note`, outermost first, or `undefined` at the notes root. */
  private toFolderPath(note: NoteMetadata): string | undefined {
    const folderNames: string[] = [];
    let parentId = note.parentId;

    while (parentId !== undefined) {
      const parent = this.index.get(parentId);
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
      const folderPath = isPathQuery ? this.toFolderPath(note) : undefined;
      const text = this.toComparableNoteName(
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

  /** The folder `name` under `parentId`, created unless it exists or a concurrent create just made it. */
  private async ensureFolder(parentId: string | undefined, name: string): Promise<NoteMetadata> {
    try {
      return await this.createFolder(parentId, name);
    } catch (error) {
      const existing = isAppErrorCode(error, APP_ERROR_CODES.CONFLICT)
        ? this.index.get(this.toNoteId(path.join(this.requireFolderPath(parentId), name)))
        : undefined;
      if (existing?.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
        throw error;
      }

      return existing;
    }
  }

  /**
   * Validate a user-supplied note or folder name. Names are never normalized or
   * auto-resolved — an unusable name is rejected so the user renames it.
   * @throws AppError INVALID_FILENAME
   */
  private assertValidNoteName(name: string): void {
    if (!name.trim()) {
      throw new AppError("Name cannot be empty", APP_ERROR_CODES.INVALID_FILENAME);
    }

    if (name !== name.trim()) {
      throw new AppError("Name cannot start or end with whitespace", APP_ERROR_CODES.INVALID_FILENAME);
    }

    // Dotfiles are valid on Unix, so the character check alone would let them through.
    if (name.startsWith(".")) {
      throw new AppError("Name cannot start with a dot", APP_ERROR_CODES.INVALID_FILENAME);
    }

    if (INVALID_NAME_CHARACTERS.test(name)) {
      throw new AppError(`Name cannot contain any of < > : " / \\ | ? *`, APP_ERROR_CODES.INVALID_FILENAME);
    }

    if (this.hasControlCharacter(name)) {
      throw new AppError("Name cannot contain control characters", APP_ERROR_CODES.INVALID_FILENAME);
    }

    if (Array.from(name).length > NOTE_NAME_MAX_LENGTH) {
      throw new AppError(`Name cannot exceed ${NOTE_NAME_MAX_LENGTH} characters`, APP_ERROR_CODES.INVALID_FILENAME);
    }
  }

  private hasControlCharacter(name: string): boolean {
    for (const character of name) {
      const code = character.codePointAt(0) ?? 0;
      if (code < FIRST_PRINTABLE_CHARACTER_CODE || code === DELETE_CHARACTER_CODE) {
        return true;
      }
    }

    return false;
  }

  /**
   * Derive a note id from a path relative to the notes root. Lowercasing is what
   * makes note identity case-insensitive while disk keeps the original casing.
   */
  private toNoteId(relativePath: string): string {
    return relativePath.split(path.sep).join(NOTE_ID_SEPARATOR).toLowerCase();
  }

  /** Derive the display name of a note from its cased basename; only markdown hides its extension. */
  private toNoteName(entryName: string, entityType: NoteEntityType): string {
    if (entityType === ENTITY_TYPE.NOTE && this.isTextNoteFilename(entryName)) {
      return path.basename(entryName, path.extname(entryName));
    }

    return entryName;
  }

  /**
   * The filename a renamed note takes. A text note keeps its markdown extension;
   * any other note is named by its full filename, whose extension cannot change
   * because it decides the content type.
   * @throws AppError VALIDATION when a non-markdown note's extension would change.
   */
  private toRenamedNoteFilename(currentFilename: string, name: string): string {
    const currentExtension = path.extname(currentFilename);
    if (this.isTextNoteFilename(currentFilename)) {
      return `${name}${currentExtension}`;
    }

    if (path.extname(name).toLowerCase() !== currentExtension.toLowerCase()) {
      const message = currentExtension
        ? `The file extension cannot be changed; keep "${currentExtension}" at the end of the name`
        : "The file extension cannot be changed; this file has none";

      throw new AppError(message, APP_ERROR_CODES.VALIDATION);
    }

    return name;
  }

  private isTextNoteFilename(filename: string): boolean {
    return this.detectNoteContentType(filename) === NOTE_CONTENT_TYPE.TEXT;
  }

  /** Markdown is the only editable form; images render read-only and anything else is unknown. */
  private detectNoteContentType(filename: string): NoteContentType {
    const extension = path.extname(filename).toLowerCase();
    if (extension === MARKDOWN_EXTENSION) {
      return NOTE_CONTENT_TYPE.TEXT;
    }

    if (isImageFileExtension(extension)) {
      return NOTE_CONTENT_TYPE.IMAGE;
    }

    return NOTE_CONTENT_TYPE.UNKNOWN;
  }

  /** The form note names compare in; names match case-insensitively. */
  private toComparableNoteName(name: string): string {
    return name.toLowerCase();
  }

  private isSameNoteName(name: string, otherName: string): boolean {
    return this.toComparableNoteName(name) === this.toComparableNoteName(otherName);
  }

  /** A wikilink target's `/`-separated segments, blank ones dropped; the last is the note's name. */
  private toWikilinkTargetSegments(target: string): string[] {
    return target
      .split(WIKILINK_TARGET_SEPARATOR)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  /** The extension an uploaded image is stored with, or undefined when its type is not accepted. */
  private toImageAssetExtension(mimeType: string): string | undefined {
    const normalizedMimeType = mimeType.trim().toLowerCase();

    return NOTE_IMAGE_ASSET_MIME_TYPES.has(normalizedMimeType) ? getExtensionByMimeType(normalizedMimeType) : undefined;
  }

  /**
   * `image-YYYYMMDD-HHMMSS<ext>` in server-local time, with `-<attempt>` before the
   * extension from the first retry on, so a name taken in the same second still
   * gets a free one.
   */
  private toImageAssetFilename(createdAt: Date, extension: string, attempt: number): string {
    const date = `${createdAt.getFullYear()}${this.padDatePart(createdAt.getMonth() + 1)}${this.padDatePart(createdAt.getDate())}`;
    const time = `${this.padDatePart(createdAt.getHours())}${this.padDatePart(createdAt.getMinutes())}${this.padDatePart(createdAt.getSeconds())}`;
    const suffix = attempt === 0 ? "" : `-${attempt}`;

    return `${IMAGE_ASSET_PREFIX}-${date}-${time}${suffix}${extension}`;
  }

  private padDatePart(value: number): string {
    return String(value).padStart(DATE_PART_LENGTH, "0");
  }

  /** Resolve a notes-root-relative path, refusing anything that escapes the root. */
  private resolvePath(relativePath: string): string {
    const resolved = path.join(this.notesPath, relativePath);
    assertWithinBase(resolved, this.notesPath);

    return resolved;
  }

  private async loadIndexes(): Promise<void> {
    this.index = await this.buildIndex(this.notesPath);
    this.trashIndex = await this.buildIndex(this.trashPath);

    log.info({ notesPath: this.notesPath, notes: this.index.size, trashed: this.trashIndex.size }, "Notes index built");
  }

  private async rebuildIndexes(): Promise<void> {
    const previousIndex = this.index;
    const previousTrashIndex = this.trashIndex;
    await this.loadIndexes();

    this.broadcastIndexChanges(previousIndex, this.index);
    this.broadcastIndexChanges(previousTrashIndex, this.trashIndex);
  }

  private async rebuildTrashIndex(): Promise<void> {
    const previousTrashIndex = this.trashIndex;
    this.trashIndex = await this.buildIndex(this.trashPath);

    this.broadcastIndexChanges(previousTrashIndex, this.trashIndex);
  }

  /** One event per entry that left, joined or changed between two builds of the same index. */
  private broadcastIndexChanges(
    previous: ReadonlyMap<string, NoteMetadata>,
    current: ReadonlyMap<string, NoteMetadata>
  ): void {
    for (const noteId of previous.keys()) {
      if (!current.has(noteId)) {
        this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_DELETED, noteId });
      }
    }

    for (const [noteId, metadata] of current) {
      const before = previous.get(noteId);
      if (!before) {
        this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_CREATED, noteId, metadata });
      } else if (
        before.path !== metadata.path ||
        before.name !== metadata.name ||
        before.parentId !== metadata.parentId ||
        before.updatedTimestamp !== metadata.updatedTimestamp
      ) {
        this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_UPDATED, noteId, metadata });
      }
    }
  }

  /**
   * Walk one subtree into its own index. The two indexes never merge: the live
   * walk skips every dot-entry, so the trash structurally cannot surface in a
   * listing, and only an explicit by-id lookup reaches the trash index.
   */
  private async buildIndex(walkPath: string): Promise<Map<string, NoteMetadata>> {
    const index = new Map<string, NoteMetadata>();
    if (await isPathExists(walkPath)) {
      await this.indexDirectory(walkPath, undefined, index, walkPath);
    }

    return index;
  }

  private async indexDirectory(
    dirPath: string,
    parentId: string | undefined,
    index: Map<string, NoteMetadata>,
    walkPath: string
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Dot-entries (including .trash) belong to neither tree.
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      assertWithinBase(entryPath, walkPath);

      // Dirent flags do not follow symlinks, so a link out of the root is neither file nor directory.
      if (entry.isDirectory()) {
        const metadata = await this.buildFolderMetadata(entryPath, entry.name, parentId);
        if (this.addToIndex(index, metadata)) {
          await this.indexDirectory(entryPath, metadata.id, index, walkPath);
        }
      } else if (entry.isFile()) {
        this.addToIndex(index, await this.buildNoteMetadata(entryPath, entry.name, parentId));
      }
    }
  }

  private addToIndex(index: Map<string, NoteMetadata>, metadata: NoteMetadata): boolean {
    if (index.has(metadata.id)) {
      log.warn({ id: metadata.id, path: metadata.path }, "Duplicate note id, note left out of the index");

      return false;
    }

    index.set(metadata.id, metadata);

    return true;
  }

  private async buildFolderMetadata(
    entryPath: string,
    entryName: string,
    parentId: string | undefined
  ): Promise<NoteFolderMetadata> {
    const stats = await statFile(entryPath);
    const relativePath = path.relative(this.notesPath, entryPath);

    return {
      id: this.toNoteId(relativePath),
      entityType: ENTITY_TYPE.NOTE_FOLDER,
      name: this.toNoteName(entryName, ENTITY_TYPE.NOTE_FOLDER),
      path: relativePath,
      parentId,
      updatedTimestamp: this.toUpdatedTimestamp(stats.mtimeMs),
      isReadOnly: true,
      isTrashed: this.isWithinRelativePath(relativePath, TRASH_DIRECTORY),
    };
  }

  private async buildNoteMetadata(
    entryPath: string,
    entryName: string,
    parentId: string | undefined
  ): Promise<NoteFileMetadata> {
    const stats = await statFile(entryPath);
    const relativePath = path.relative(this.notesPath, entryPath);
    const contentType = this.detectNoteContentType(entryName);
    const isTrashed = this.isWithinRelativePath(relativePath, TRASH_DIRECTORY);

    return {
      id: this.toNoteId(relativePath),
      entityType: ENTITY_TYPE.NOTE,
      name: this.toNoteName(entryName, ENTITY_TYPE.NOTE),
      path: relativePath,
      parentId,
      updatedTimestamp: this.toUpdatedTimestamp(stats.mtimeMs),
      isReadOnly: isTrashed || contentType !== NOTE_CONTENT_TYPE.TEXT,
      isTrashed,
      contentType,
      size: stats.size,
    };
  }
}
