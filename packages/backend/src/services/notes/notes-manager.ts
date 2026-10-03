import fs from "node:fs/promises";
import path from "node:path";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
  type NoteMetadata,
  type UpdateNoteInput,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import {
  assertRealPathWithinBase,
  assertWithinBase,
  createBinaryFile,
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
  writeTextFile,
} from "../../utils/fs-utils.js";
import { logger } from "../../utils/logger.js";
import { NOTE_ASSETS_FOLDER_NAME, toImageAssetExtension, toImageAssetFilename } from "./notes-asset.js";
import { detectNoteContentType } from "./notes-content-detector.js";
import { toNoteId, toNoteName, toRenamedNoteFilename } from "./notes-id.js";
import { assertValidNoteName } from "./notes-validation.js";
import type { ReadNoteResult, ResolvedNotePath } from "./notes-manager.types.js";

const log = logger.child({ context: "notes-manager" });

/** Extension of every note created in the app; text notes are markdown */
const MARKDOWN_EXTENSION = ".md";

/** Mirror of the live tree holding deleted notes at their original relative paths */
const TRASH_DIRECTORY = ".trash";

/** Bounds the `-n` suffix search for images saved in the same second */
const MAX_ASSET_NAME_ATTEMPTS = 100;

/** mtime carries sub-millisecond precision that would not survive a round trip through JSON */
function toUpdatedTimestamp(mtimeMs: number): number {
  return Math.trunc(mtimeMs);
}

/** Whether `candidatePath` is `ancestorPath` itself or sits underneath it */
function isWithinRelativePath(candidatePath: string, ancestorPath: string): boolean {
  return candidatePath === ancestorPath || candidatePath.startsWith(ancestorPath + path.sep);
}

/**
 * Where a trashed note goes back to: its path with the `.trash` prefix
 * stripped. Only ever call this with a path that carries the prefix — a trash
 * index entry — or the result climbs out of the notes root.
 */
function toRestoredPath(trashedPath: string): string {
  return path.relative(TRASH_DIRECTORY, trashedPath);
}

/** Read an indexed note off disk; the caller resolves the path within its own scope. */
async function readNoteFile(metadata: NoteFileMetadata, notePath: string): Promise<ReadNoteResult> {
  const content =
    metadata.contentType === NOTE_CONTENT_TYPE.TEXT ? await readTextFile(notePath) : await readBinaryFile(notePath);

  return { metadata, content };
}

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

  constructor(notesPath: string) {
    this.notesPath = notesPath;
    this.trashPath = path.join(notesPath, TRASH_DIRECTORY);
  }

  /** Ensure the notes root exists and build both indexes from disk. */
  public async initialize(): Promise<void> {
    await ensureDir(this.notesPath);
    await this.rebuildIndexes();
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
   * Read a note's content, live or trashed — deleting a note revokes editing,
   * not reading. Text notes come back as a string, image and unknown notes as
   * raw bytes for the caller to stream.
   * @throws AppError NOT_FOUND when the id is not indexed, NOT_SUPPORTED when
   * it names a folder.
   */
  public async getNoteContent(id: string): Promise<ReadNoteResult> {
    const metadata = this.requireNote(id);
    if (metadata.entityType !== ENTITY_TYPE.NOTE) {
      throw new AppError(`Not a readable note: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    return readNoteFile(metadata, this.resolvePath(metadata.path));
  }

  /**
   * Create a folder under `parentId`, or at the notes root when it is undefined.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT on a colliding id.
   */
  public async createFolder(parentId: string | undefined, name: string): Promise<NoteMetadata> {
    const target = await this.resolveNewTarget(parentId, name, name);
    await ensureDir(target.absolutePath);

    return this.reindexAndGet(target.id);
  }

  /**
   * Create a markdown note named `<name>.md` under `parentId`.
   * @throws AppError INVALID_FILENAME on a rejected name, CONFLICT on a colliding id.
   */
  public async createTextNote(parentId: string | undefined, name: string, content = ""): Promise<NoteMetadata> {
    const target = await this.resolveNewTarget(parentId, name, `${name}${MARKDOWN_EXTENSION}`);
    await writeTextFile(target.absolutePath, content);

    return this.reindexAndGet(target.id);
  }

  /**
   * Save an image into the `assets` folder beside a text note, under a
   * server-generated `image-YYYYMMDD-HHMMSS` name; nothing the client sends
   * reaches the filesystem except the bytes.
   * @throws AppError NOT_SUPPORTED when the id names a folder or a read-only
   * note, VALIDATION when the MIME type is not an accepted image type.
   */
  public async createImageAsset(noteId: string, mimeType: string, content: Buffer): Promise<NoteMetadata> {
    const metadata = this.requireNote(noteId);
    if (metadata.entityType !== ENTITY_TYPE.NOTE || metadata.isReadOnly) {
      throw new AppError(`Images can only be added to an editable note: ${noteId}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const extension = toImageAssetExtension(mimeType);
    if (!extension) {
      throw new AppError(`Unsupported image type: ${mimeType}`, APP_ERROR_CODES.VALIDATION);
    }

    const assetsPath = await this.ensureAssetsFolder(metadata.parentId);
    const createdAt = new Date();
    for (let attempt = 0; attempt < MAX_ASSET_NAME_ATTEMPTS; attempt++) {
      const target = this.toNewTarget(assetsPath, toImageAssetFilename(createdAt, extension, attempt));
      if (this.index.has(target.id)) {
        continue;
      }

      await assertRealPathWithinBase(target.absolutePath, this.notesPath);
      if (await createBinaryFile(target.absolutePath, content)) {
        return this.reindexAndGet(target.id);
      }
    }

    throw new AppError(`No free image name left in "${assetsPath}"`, APP_ERROR_CODES.CONFLICT);
  }

  /**
   * Replace a text note's content. `updatedTimestamp` is the token from the
   * last read or write; the returned metadata carries the token for the next.
   * @throws AppError NOT_SUPPORTED when the id names a folder or the note is
   * read-only (a trashed, image or unknown note), CONFLICT when the token no
   * longer matches disk.
   */
  public async writeNoteContent(id: string, content: string, updatedTimestamp: number): Promise<NoteFileMetadata> {
    const metadata = this.requireNote(id);
    if (metadata.entityType !== ENTITY_TYPE.NOTE) {
      throw new AppError(`Not a writable note: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    if (metadata.isReadOnly) {
      throw new AppError(`Note is not editable: ${id}`, APP_ERROR_CODES.NOT_SUPPORTED);
    }

    const notePath = this.resolvePath(metadata.path);
    const stats = await statFile(notePath);
    if (toUpdatedTimestamp(stats.mtimeMs) !== updatedTimestamp) {
      throw new AppError(`Note changed on disk since it was loaded: ${id}`, APP_ERROR_CODES.CONFLICT);
    }

    await writeTextFile(notePath, content);
    const updated = await this.buildNoteMetadata(notePath, path.basename(metadata.path), metadata.parentId);
    this.index.set(updated.id, updated);

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
    const filename = isFolder ? name : toRenamedNoteFilename(path.basename(metadata.path), name);
    const nextParentId = update.parentId === undefined ? metadata.parentId : (update.parentId ?? undefined);
    const nextRelativePath = path.join(this.requireFolderPath(nextParentId), filename);
    if (nextRelativePath === metadata.path) {
      return metadata;
    }

    assertValidNoteName(name);

    if (isFolder && isWithinRelativePath(nextRelativePath, metadata.path)) {
      throw new AppError(`A folder cannot be moved into itself: ${id}`, APP_ERROR_CODES.VALIDATION);
    }

    const nextId = toNoteId(nextRelativePath);
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
    const restoredPath = toRestoredPath(metadata.path);
    const targetPath = path.join(this.notesPath, restoredPath);

    await this.assertRestorable(sourcePath, targetPath);
    await ensureDir(path.dirname(targetPath));
    await assertRealPathWithinBase(targetPath, this.notesPath);
    await mergeMove(sourcePath, targetPath);
    await removeEmptyAncestors(path.dirname(sourcePath), this.trashPath);

    await this.rebuildIndexes();

    return this.requireLiveNote(toNoteId(restoredPath));
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

  /**
   * A note from either tree. Ids are unique across both, so the lookup resolves
   * to exactly one note wherever it lives; `isReadOnly` is what refuses a write
   * to a trashed one, so reading it stays available.
   */
  private requireNote(id: string): NoteMetadata {
    const metadata = this.index.get(id) ?? this.trashIndex.get(id);
    if (!metadata) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
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
    assertValidNoteName(name);

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

    return { id: toNoteId(relativePath), relativePath, absolutePath: path.join(this.notesPath, relativePath) };
  }

  /**
   * The `assets` folder beside a note, created when missing.
   * @throws AppError CONFLICT when a file already holds the folder's name.
   */
  private async ensureAssetsFolder(parentId: string | undefined): Promise<string> {
    const folder = this.toNewTarget(this.requireFolderPath(parentId), NOTE_ASSETS_FOLDER_NAME);
    const existing = this.index.get(folder.id);
    if (existing && existing.entityType !== ENTITY_TYPE.NOTE_FOLDER) {
      throw new AppError(`"${existing.path}" is a file, not an assets folder`, APP_ERROR_CODES.CONFLICT);
    }

    await assertRealPathWithinBase(folder.absolutePath, this.notesPath);
    await ensureDir(folder.absolutePath);

    return folder.relativePath;
  }

  /** A structural change re-keys descendants, so the index is rebuilt rather than patched. */
  private async reindexAndGet(id: string): Promise<NoteMetadata> {
    await this.rebuildIndexes();

    return this.requireLiveNote(id);
  }

  /** Resolve a notes-root-relative path, refusing anything that escapes the root. */
  private resolvePath(relativePath: string): string {
    const resolved = path.join(this.notesPath, relativePath);
    assertWithinBase(resolved, this.notesPath);

    return resolved;
  }

  private async rebuildIndexes(): Promise<void> {
    this.index = await this.buildIndex(this.notesPath);
    await this.rebuildTrashIndex();

    log.info({ notesPath: this.notesPath, notes: this.index.size, trashed: this.trashIndex.size }, "Notes index built");
  }

  private async rebuildTrashIndex(): Promise<void> {
    this.trashIndex = await this.buildIndex(this.trashPath);
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
      id: toNoteId(relativePath),
      entityType: ENTITY_TYPE.NOTE_FOLDER,
      name: toNoteName(entryName, ENTITY_TYPE.NOTE_FOLDER),
      path: relativePath,
      parentId,
      updatedTimestamp: toUpdatedTimestamp(stats.mtimeMs),
      isReadOnly: true,
      isTrashed: isWithinRelativePath(relativePath, TRASH_DIRECTORY),
    };
  }

  private async buildNoteMetadata(
    entryPath: string,
    entryName: string,
    parentId: string | undefined
  ): Promise<NoteFileMetadata> {
    const stats = await statFile(entryPath);
    const relativePath = path.relative(this.notesPath, entryPath);
    const contentType = detectNoteContentType(entryName);
    const isTrashed = isWithinRelativePath(relativePath, TRASH_DIRECTORY);

    return {
      id: toNoteId(relativePath),
      entityType: ENTITY_TYPE.NOTE,
      name: toNoteName(entryName, ENTITY_TYPE.NOTE),
      path: relativePath,
      parentId,
      updatedTimestamp: toUpdatedTimestamp(stats.mtimeMs),
      isReadOnly: isTrashed || contentType !== NOTE_CONTENT_TYPE.TEXT,
      isTrashed,
      contentType,
      size: stats.size,
    };
  }
}
