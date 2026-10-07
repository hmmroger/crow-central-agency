import fs from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";
import {
  ENTITY_TYPE,
  getExtensionByMimeType,
  hashtagExtension,
  isImageFileExtension,
  NOTE_CONTENT_TYPE,
  NOTE_IMAGE_ASSET_MIME_TYPES,
  NOTE_NAME_MAX_LENGTH,
  SERVER_MESSAGE_TYPE,
  TAG_TOKEN,
  taglineExtension,
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
} from "../../utils/fs-utils.js";
import { logger } from "../../utils/logger.js";
import type { RelationshipManager } from "../relationship-manager.js";
import type { TagManager } from "../tag/tag-manager.js";
import type { WsBroadcaster } from "../ws-broadcaster.js";
import type {
  CreateNoteOptions,
  ListNotesOptions,
  NoteTreeScan,
  ParsedNoteContent,
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
  private readonly markdownParser = new Marked({ extensions: [taglineExtension, hashtagExtension] });

  constructor(
    notesPath: string,
    private readonly broadcaster: WsBroadcaster,
    private readonly relationshipManager: RelationshipManager,
    private readonly tagManager: TagManager
  ) {
    this.notesPath = notesPath;
    this.trashPath = path.join(notesPath, TRASH_DIRECTORY);
  }

  /** Ensure the notes root exists and build both indexes from disk. */
  public async initialize(): Promise<void> {
    await ensureDir(this.notesPath);
    await this.loadIndexes();
  }

  /** Live notes directly under `parentId` (the root when omitted), or everything under it when recursive. */
  public listNotes(options: ListNotesOptions = {}): NoteMetadata[] {
    return this.listEntries(false, options);
  }

  /** Trashed notes, listed like `listNotes`. Their ids carry the `.trash:` prefix of their path. */
  public listTrashNotes(options: ListNotesOptions = {}): NoteMetadata[] {
    return this.listEntries(true, options);
  }

  /**
   * A note from either tree. Ids are unique across both, so the lookup resolves
   * to exactly one note wherever it lives; `isReadOnly` is what refuses a write
   * to a trashed one, so reading it stays available.
   * @throws AppError NOT_FOUND when the id is not indexed.
   */
  public getNote(id: string): NoteMetadata {
    const metadata = this.findEntry(id);
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
   * Create a note under `options.parentId`, or at the notes root. Text content
   * makes a markdown note saved as `<name>.md`; bytes are saved under the filename `name`.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT when the id or the file is taken.
   */
  public async createNote(
    name: string,
    content: string | Buffer,
    options: CreateNoteOptions = {}
  ): Promise<NoteFileMetadata> {
    const isText = !Buffer.isBuffer(content);
    const filename = isText ? `${name}${MARKDOWN_EXTENSION}` : name;
    const target = await this.resolveNewTarget(options.parentId, name, filename);
    if (
      !(await writeBinaryFile(target.absolutePath, isText ? Buffer.from(content, "utf-8") : content, {
        overwrite: false,
      }))
    ) {
      throw new AppError(`A note or folder with id "${target.id}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    const metadata = await this.indexCreatedNote(target, options.parentId);
    // MARKDOWN_EXTENSION determines the contentType
    if (isText) {
      await this.applyParsedContent(new Map([[metadata.id, this.parseNoteContent(content)]]));
    }

    return metadata;
  }

  /**
   * Create a folder under `options.parentId`, or at the notes root.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT when the id or the path is taken.
   */
  public async createFolder(name: string, options: CreateNoteOptions = {}): Promise<NoteFolderMetadata> {
    const target = await this.resolveNewTarget(options.parentId, name, name);

    return this.createDirectory(target, options.parentId);
  }

  /** What each target names in the live tree; never creates. */
  public resolveWikilinkBatch(targets: string[]): WikilinkResolution[] {
    return targets.map((target) => ({ target, note: this.findWikilinkNote(target) }));
  }

  /**
   * The note `target` names, created when it names nothing: a bare name beside
   * the source note, `a/b/name` from the notes root with any missing folders.
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

    const placement = this.findWikilinkPlacement(target, this.requireLiveNote(sourceNoteId));
    if (!placement) {
      throw new AppError("A link needs a note name", APP_ERROR_CODES.VALIDATION);
    }

    let parentId = placement.parentId;
    for (const folderName of placement.missingFolderNames) {
      parentId = (await this.createFolder(folderName, { parentId })).id;
    }

    return this.createNote(placement.noteName, "", { parentId });
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
      folderPath: this.getFolderDisplayPath(note),
      target: this.findShortestWikilinkTarget(note),
    }));
  }

  /** Every live folder a note may move into: all but the note itself and its descendants. */
  public getMoveDestinations(id: string): NoteFolderMetadata[] {
    const note = this.requireLiveNote(id);
    const excludedIds = new Set(this.listDescendants(note).map((entry) => entry.id)).add(note.id);
    const destinations: NoteFolderMetadata[] = [];
    for (const metadata of this.index.values()) {
      if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER && !excludedIds.has(metadata.id)) {
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
        const note = await this.indexCreatedNote(target, assetsFolder.id);

        return { note, target: this.findShortestWikilinkTarget(note) };
      }
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

    await writeBinaryFile(notePath, Buffer.from(content, "utf-8"));
    const updated = await this.buildNoteMetadata(notePath, path.basename(metadata.path), metadata.parentId);
    this.putEntry(updated);
    await this.applyParsedContent(new Map([[updated.id, this.parseNoteContent(content)]]));

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

    const descendants = this.listDescendants(metadata);
    const renamed = await renameFile(this.resolvePath(metadata.path), nextAbsolutePath);
    if (!renamed) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    if (nextId !== id) {
      this.removeEntry(metadata.id);
      this.removeEntries(descendants);
    }

    const movedEntries = await this.reindexMoved(metadata, descendants, nextRelativePath, nextParentId);
    await this.refreshFolder(metadata.parentId);
    await this.refreshFolder(nextParentId);
    if (nextId !== id) {
      await this.rekeyNoteTags(movedEntries);
    }

    return this.requireLiveNote(nextId);
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
    const trashedPath = path.join(TRASH_DIRECTORY, metadata.path);
    const targetPath = path.join(this.notesPath, trashedPath);

    // The guard resolves symlinks, so it runs once the parent chain it has to
    // resolve exists.
    await ensureDir(path.dirname(targetPath));
    await assertRealPathWithinBase(targetPath, this.notesPath);
    const descendants = this.listDescendants(metadata);
    await mergeMove(sourcePath, targetPath);

    this.removeEntry(metadata.id);
    this.removeEntries(descendants);

    await this.refreshFolder(metadata.parentId);
    const trashParentId = await this.indexFolderChain(path.dirname(trashedPath));
    const trashedEntries = await this.reindexMoved(metadata, descendants, trashedPath, trashParentId);
    await this.clearNoteTags(trashedEntries);
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
    const descendants = this.listDescendants(metadata);
    await mergeMove(sourcePath, targetPath);
    await removeEmptyAncestors(path.dirname(sourcePath), this.trashPath);

    this.removeEntry(metadata.id);
    this.removeEntries(descendants);

    await this.dropPrunedTrashFolders(path.dirname(metadata.path));
    const parentId = await this.indexFolderChain(path.dirname(restoredPath));
    const restoredEntries = await this.reindexMoved(metadata, descendants, restoredPath, parentId);
    await this.applyParsedContent(await this.parseNoteFiles(restoredEntries.values()));

    return this.requireLiveNote(this.toNoteId(restoredPath));
  }

  /** Permanently remove everything in the trash. */
  public async emptyTrash(): Promise<void> {
    await removeDir(this.trashPath);

    for (const id of this.trashIndex.keys()) {
      this.removeEntry(id);
    }
  }

  /** Permanently remove a single trashed note. */
  private async purgeNote(id: string): Promise<void> {
    const metadata = this.requireTrashedNote(id);
    const targetPath = this.resolvePath(metadata.path);
    const descendants = this.listDescendants(metadata);

    if (metadata.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      await removeDir(targetPath);
    } else {
      await deleteFile(targetPath);
    }

    await removeEmptyAncestors(path.dirname(targetPath), this.trashPath);

    this.removeEntry(metadata.id);
    this.removeEntries(descendants);

    await this.dropPrunedTrashFolders(path.dirname(metadata.path));
  }

  /** Entries of one tree directly under `parentId` (the tree root when omitted), or everything under it when recursive; order unspecified. */
  private listEntries(isTrashed: boolean, options: ListNotesOptions): NoteMetadata[] {
    const index = this.getIndex(isTrashed);
    const parent = options.parentId === undefined ? undefined : index.get(options.parentId);
    if (options.parentId !== undefined && parent?.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      throw new AppError(`Folder not found: ${options.parentId}`, APP_ERROR_CODES.NOT_FOUND);
    }

    if (!options.isRecursive) {
      return Array.from(index.values()).filter((entry) => entry.parentId === options.parentId);
    }

    if (!parent) {
      return Array.from(index.values());
    }

    const childrenByParentId = this.groupByParentId(index.values());
    const descendants = Array.from(childrenByParentId.get(parent.id) ?? []);
    for (let position = 0; position < descendants.length; position++) {
      descendants.push(...(childrenByParentId.get(descendants[position].id) ?? []));
    }

    return descendants;
  }

  /** Every entry under `entry` in its own tree; a note has none. */
  private listDescendants(entry: NoteMetadata): NoteMetadata[] {
    return entry.entityType === ENTITY_TYPE.NOTE_FOLDER
      ? this.listEntries(entry.isTrashed, { parentId: entry.id, isRecursive: true })
      : [];
  }

  private groupByParentId(entries: Iterable<NoteMetadata>): Map<string | undefined, NoteMetadata[]> {
    const childrenByParentId = new Map<string | undefined, NoteMetadata[]>();
    for (const entry of entries) {
      const children = childrenByParentId.get(entry.parentId);
      if (children) {
        children.push(entry);
      } else {
        childrenByParentId.set(entry.parentId, [entry]);
      }
    }

    return childrenByParentId;
  }

  /**
   * Index `root` and its `descendants` after a move carried `root` to `toPath`; only `root`
   * takes `parentId`, the rest keep their place under it. Each entry is rebuilt from disk at
   * its new path. Returns each moved entry by its old id.
   */
  private async reindexMoved(
    root: NoteMetadata,
    descendants: ReadonlyArray<NoteMetadata>,
    toPath: string,
    parentId: string | undefined
  ): Promise<Map<string, NoteMetadata>> {
    const movedEntries = new Map<string, NoteMetadata>();
    movedEntries.set(root.id, await this.reindexMovedEntry(root, toPath, parentId));
    for (const entry of descendants) {
      const relativePath = path.join(toPath, path.relative(root.path, entry.path));
      const moved = await this.reindexMovedEntry(entry, relativePath, this.toNoteId(path.dirname(relativePath)));
      movedEntries.set(entry.id, moved);
    }

    return movedEntries;
  }

  /** Index one moved entry at `relativePath`; a file landing on an indexed folder drops that folder and everything under it. */
  private async reindexMovedEntry(
    entry: NoteMetadata,
    relativePath: string,
    parentId: string | undefined
  ): Promise<NoteMetadata> {
    const absolutePath = this.resolvePath(relativePath);
    const entryName = path.basename(relativePath);
    const moved =
      entry.entityType === ENTITY_TYPE.NOTE_FOLDER
        ? await this.buildFolderMetadata(absolutePath, entryName, parentId)
        : await this.buildNoteMetadata(absolutePath, entryName, parentId);
    const existing = this.getIndex(moved.isTrashed).get(moved.id);
    if (existing?.entityType === ENTITY_TYPE.NOTE_FOLDER && moved.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      this.removeEntry(existing.id);
      this.removeEntries(this.listDescendants(existing));
    }

    this.putEntry(moved);

    return moved;
  }

  /**
   * Index the folders down to `folderPath` that a move created, and update those
   * whose timestamp changed. Returns the id of the innermost folder, or undefined at a tree root.
   */
  private async indexFolderChain(folderPath: string): Promise<string | undefined> {
    const folderPaths: string[] = [];
    for (let current = folderPath; !this.isTreeRoot(current); current = path.dirname(current)) {
      folderPaths.unshift(current);
    }

    let parentId: string | undefined;
    for (const current of folderPaths) {
      const folder = await this.buildFolderMetadata(this.resolvePath(current), path.basename(current), parentId);
      if (this.getIndex(folder.isTrashed).get(folder.id)?.updatedTimestamp !== folder.updatedTimestamp) {
        this.putEntry(folder);
      }

      parentId = folder.id;
    }

    return parentId;
  }

  /** Drop the trash folders from `folderPath` up that removeEmptyAncestors pruned, and refresh the first one left. */
  private async dropPrunedTrashFolders(folderPath: string): Promise<void> {
    for (let current = folderPath; !this.isTreeRoot(current); current = path.dirname(current)) {
      const folderId = this.toNoteId(current);
      if (await isPathExists(this.resolvePath(current))) {
        await this.refreshFolder(folderId);

        return;
      }

      this.removeEntry(folderId);
    }
  }

  /** The notes root, or the trash root that mirrors it */
  private isTreeRoot(relativePath: string): boolean {
    return relativePath === "." || relativePath === TRASH_DIRECTORY;
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
  private async ensureAssetsFolder(parentId: string | undefined): Promise<NoteFolderMetadata> {
    const folder = this.toNewTarget(this.requireFolderPath(parentId), NOTE_ASSETS_FOLDER_NAME);
    const existing = this.index.get(folder.id);
    if (existing?.entityType === ENTITY_TYPE.NOTE_FOLDER) {
      return existing;
    }

    if (existing) {
      throw new AppError(`"${existing.path}" is a file, not an assets folder`, APP_ERROR_CODES.CONFLICT);
    }

    await assertRealPathWithinBase(folder.absolutePath, this.notesPath);

    return this.createDirectory(folder, parentId);
  }

  /**
   * Create the folder at `target` and index it.
   * @throws AppError CONFLICT when something other than a folder already holds the path.
   */
  private async createDirectory(target: ResolvedNotePath, parentId: string | undefined): Promise<NoteFolderMetadata> {
    const stats = await getPathStats(target.absolutePath);
    if (stats && !stats.isDirectory()) {
      throw new AppError(`A note or folder with id "${target.id}" already exists`, APP_ERROR_CODES.CONFLICT);
    }

    await ensureDir(target.absolutePath);
    const metadata = await this.buildFolderMetadata(target.absolutePath, path.basename(target.relativePath), parentId);
    this.putEntry(metadata);
    await this.refreshFolder(parentId);

    return metadata;
  }

  /** Index the note just written at `target`, and its parent folder whose timestamp it changed. */
  private async indexCreatedNote(target: ResolvedNotePath, parentId: string | undefined): Promise<NoteFileMetadata> {
    const metadata = await this.buildNoteMetadata(target.absolutePath, path.basename(target.relativePath), parentId);
    this.putEntry(metadata);
    await this.refreshFolder(parentId);

    return metadata;
  }

  /** Re-stat a folder whose entries changed, updating it when its timestamp moved. */
  private async refreshFolder(folderId: string | undefined): Promise<void> {
    const folder = folderId === undefined ? undefined : this.findEntry(folderId);
    if (folder?.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      return;
    }

    const refreshed = await this.buildFolderMetadata(
      this.resolvePath(folder.path),
      path.basename(folder.path),
      folder.parentId
    );
    if (refreshed.updatedTimestamp !== folder.updatedTimestamp) {
      this.putEntry(refreshed);
    }
  }

  /** Index an entry in the tree it belongs to and tell clients it was created or updated. */
  private putEntry(metadata: NoteMetadata): void {
    const index = this.getIndex(metadata.isTrashed);
    const type = index.has(metadata.id) ? SERVER_MESSAGE_TYPE.NOTE_UPDATED : SERVER_MESSAGE_TYPE.NOTE_CREATED;
    index.set(metadata.id, metadata);
    this.broadcaster.broadcast({ type, noteId: metadata.id, metadata });
  }

  /** Drop an entry from whichever tree holds it and tell clients it is gone. */
  private removeEntry(id: string): void {
    if (this.index.delete(id) || this.trashIndex.delete(id)) {
      this.broadcaster.broadcast({ type: SERVER_MESSAGE_TYPE.NOTE_DELETED, noteId: id });
    }
  }

  private removeEntries(entries: Iterable<NoteMetadata>): void {
    for (const entry of entries) {
      this.removeEntry(entry.id);
    }
  }

  /** An entry from either tree; ids are unique across both. */
  private findEntry(id: string): NoteMetadata | undefined {
    return this.index.get(id) ?? this.trashIndex.get(id);
  }

  private getIndex(isTrashed: boolean): Map<string, NoteMetadata> {
    return isTrashed ? this.trashIndex : this.index;
  }

  /** Whether `candidatePath` is `ancestorPath` itself or sits underneath it */
  private isWithinRelativePath(candidatePath: string, ancestorPath: string): boolean {
    return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + path.sep);
  }

  /** mtime carries sub-millisecond precision that would not survive a round trip through JSON */
  private toUpdatedTimestamp(mtimeMs: number): number {
    return Math.trunc(mtimeMs);
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
  private findShortestWikilinkTarget(note: NoteMetadata): string {
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
  private findWikilinkPlacement(target: string, sourceNote: NoteMetadata): WikilinkPlacement | undefined {
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
  private getFolderDisplayPath(note: NoteMetadata): string | undefined {
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
      const folderPath = isPathQuery ? this.getFolderDisplayPath(note) : undefined;
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
    const liveScan = await this.scanTree(this.notesPath, true);
    const trashScan = await this.scanTree(this.trashPath, false);
    this.index = liveScan.index;
    this.trashIndex = trashScan.index;

    log.info({ notesPath: this.notesPath, notes: this.index.size, trashed: this.trashIndex.size }, "Notes index built");

    await this.applyParsedContent(liveScan.parsedContentByNoteId);
  }

  /**
   * Walk one tree into its own index. The two indexes never merge: the live
   * walk skips every dot-entry, so the trash structurally cannot surface in a
   * listing, and only an explicit by-id lookup reaches the trash index. With
   * `isContentParsed`, each text note is read and parsed as it is indexed, so no second walk is needed.
   */
  private async scanTree(walkPath: string, isContentParsed: boolean): Promise<NoteTreeScan> {
    const scan: NoteTreeScan = { walkPath, isContentParsed, index: new Map(), parsedContentByNoteId: new Map() };
    if (await isPathExists(walkPath)) {
      await this.scanDirectory(walkPath, undefined, scan);
    }

    return scan;
  }

  private async scanDirectory(dirPath: string, parentId: string | undefined, scan: NoteTreeScan): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Dot-entries (including .trash) belong to neither tree.
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      assertWithinBase(entryPath, scan.walkPath);

      // Dirent flags do not follow symlinks, so a link out of the root is neither file nor directory.
      if (entry.isDirectory()) {
        const metadata = await this.buildFolderMetadata(entryPath, entry.name, parentId);
        if (this.addToIndex(scan.index, metadata)) {
          await this.scanDirectory(entryPath, metadata.id, scan);
        }
      } else if (entry.isFile()) {
        await this.scanFile(entryPath, entry.name, parentId, scan);
      }
    }
  }

  private async scanFile(
    entryPath: string,
    entryName: string,
    parentId: string | undefined,
    scan: NoteTreeScan
  ): Promise<void> {
    const metadata = await this.buildNoteMetadata(entryPath, entryName, parentId);
    if (!this.addToIndex(scan.index, metadata) || !scan.isContentParsed) {
      return;
    }

    const parsedContent = await this.parseNoteFile(metadata);
    if (parsedContent) {
      scan.parsedContentByNoteId.set(metadata.id, parsedContent);
    }
  }

  /** Parse every text note among `entries` from disk, for notes whose content is not in hand. */
  private async parseNoteFiles(entries: Iterable<NoteMetadata>): Promise<Map<string, ParsedNoteContent>> {
    const parsedContentByNoteId = new Map<string, ParsedNoteContent>();
    for (const entry of entries) {
      const parsedContent = entry.entityType === ENTITY_TYPE.NOTE ? await this.parseNoteFile(entry) : undefined;
      if (parsedContent) {
        parsedContentByNoteId.set(entry.id, parsedContent);
      }
    }

    return parsedContentByNoteId;
  }

  /** Read a text note and parse it; any other note, or one that can't be read, yields undefined. */
  private async parseNoteFile(metadata: NoteFileMetadata): Promise<ParsedNoteContent | undefined> {
    if (metadata.contentType !== NOTE_CONTENT_TYPE.TEXT) {
      return undefined;
    }

    try {
      return this.parseNoteContent(await readTextFile(this.resolvePath(metadata.path)));
    } catch (error) {
      log.warn({ error, noteId: metadata.id }, "Failed to read note content");

      return undefined;
    }
  }

  /** Apply what each note's parsed content drives; every content-derived relationship is synced here. */
  private async applyParsedContent(parsedContentByNoteId: ReadonlyMap<string, ParsedNoteContent>): Promise<void> {
    const tagNamesByNoteId = new Map<string, string[]>();
    for (const [noteId, parsedContent] of parsedContentByNoteId) {
      tagNamesByNoteId.set(noteId, parsedContent.tags);
    }

    await this.setNoteTags(ENTITY_TYPE.NOTE, tagNamesByNoteId);
  }

  /** The tokens of a text note the notes collection cares about, from one parse. */
  private parseNoteContent(content: string): ParsedNoteContent {
    const tags: string[] = [];
    this.markdownParser.walkTokens(this.markdownParser.lexer(content), (token) => {
      if (token.type === TAG_TOKEN.HASHTAG && typeof token.text === "string") {
        tags.push(token.text);
      }
    });

    return { tags };
  }

  /** Replace the tags of the given notes; a tag failure is logged and never fails the note operation. */
  private async setNoteTags(
    entityType: NoteEntityType,
    tagNamesByNoteId: ReadonlyMap<string, string[]>
  ): Promise<void> {
    try {
      await this.tagManager.setEntityTags(entityType, tagNamesByNoteId);
    } catch (error) {
      log.error({ error, entityType, notes: tagNamesByNoteId.size }, "Failed to set note tags");
    }
  }

  /** Clear the tags held under the old id of every moved note and folder. */
  private async clearNoteTags(movedEntries: ReadonlyMap<string, NoteMetadata>): Promise<void> {
    const clearedNoteTags = new Map<string, string[]>();
    const clearedFolderTags = new Map<string, string[]>();
    for (const [previousId, entry] of movedEntries) {
      const clearedTags = entry.entityType === ENTITY_TYPE.NOTE_FOLDER ? clearedFolderTags : clearedNoteTags;
      clearedTags.set(previousId, []);
    }

    await this.setNoteTags(ENTITY_TYPE.NOTE, clearedNoteTags);
    await this.setNoteTags(ENTITY_TYPE.NOTE_FOLDER, clearedFolderTags);
  }

  /** Move the tag edges of re-keyed notes to their new ids; a failure is logged and never fails the move. */
  private async rekeyNoteTags(movedEntries: ReadonlyMap<string, NoteMetadata>): Promise<void> {
    const idMap = new Map<string, string>();
    for (const [previousId, entry] of movedEntries) {
      idMap.set(previousId, entry.id);
    }

    try {
      await this.relationshipManager.rekeyEntities(idMap);
    } catch (error) {
      log.error({ error, notes: idMap.size }, "Failed to rekey note tags");
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
