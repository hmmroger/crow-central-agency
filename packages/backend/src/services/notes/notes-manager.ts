import fs from "node:fs/promises";
import path from "node:path";
import {
  ENTITY_TYPE,
  NOTE_CONTENT_TYPE,
  type NoteFileMetadata,
  type NoteFolderMetadata,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { AppError } from "../../core/error/app-error.js";
import { APP_ERROR_CODES } from "../../core/error/app-error.types.js";
import { assertWithinBase, ensureDir, readBinaryFile, readTextFile, statFile } from "../../utils/fs-utils.js";
import { logger } from "../../utils/logger.js";
import { detectNoteContentType } from "./notes-content-detector.js";
import { toNoteId, toNoteName } from "./notes-id.js";
import type { ReadNoteResult } from "./notes-manager.types.js";

const log = logger.child({ context: "notes-manager" });

/**
 * Manages the user's note tree, stored as plain files under the notes root.
 * A file is a note, a directory is a folder, and the in-memory index is a pure
 * cache rebuilt from disk — identity, title and content always come from the
 * filesystem. Every path resolution is confined to the notes root.
 */
export class NotesManager {
  private readonly notesPath: string;
  private index = new Map<string, NoteMetadata>();

  constructor(notesPath: string) {
    this.notesPath = notesPath;
  }

  /** Ensure the notes root exists and build the live index from disk. */
  public async initialize(): Promise<void> {
    await ensureDir(this.notesPath);
    await this.rebuildIndex();
  }

  /** The live note tree as a flat list; consumers compose it via `parentId`. */
  public getTree(): NoteMetadata[] {
    return Array.from(this.index.values());
  }

  /**
   * Read a note's content. Text notes come back as a string, image and unknown
   * notes as raw bytes for the caller to stream.
   * @throws AppError with NOT_FOUND when the id is not an indexed note.
   */
  public async getNoteContent(id: string): Promise<ReadNoteResult> {
    const metadata = this.index.get(id);
    if (!metadata || metadata.entityType !== ENTITY_TYPE.NOTE) {
      throw new AppError(`Note not found: ${id}`, APP_ERROR_CODES.NOT_FOUND);
    }

    const notePath = this.resolvePath(metadata.path);
    const content =
      metadata.contentType === NOTE_CONTENT_TYPE.TEXT ? await readTextFile(notePath) : await readBinaryFile(notePath);

    return { metadata, content };
  }

  /** Resolve a notes-root-relative path, refusing anything that escapes the root. */
  private resolvePath(relativePath: string): string {
    const resolved = path.join(this.notesPath, relativePath);
    assertWithinBase(resolved, this.notesPath);

    return resolved;
  }

  private async rebuildIndex(): Promise<void> {
    const index = new Map<string, NoteMetadata>();
    await this.indexDirectory(this.notesPath, undefined, index);
    this.index = index;

    log.info({ notesPath: this.notesPath, nodes: index.size }, "Notes index built");
  }

  private async indexDirectory(
    dirPath: string,
    parentId: string | undefined,
    index: Map<string, NoteMetadata>
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Dot-entries (including .trash) never belong to the live tree.
      if (entry.name.startsWith(".")) {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      assertWithinBase(entryPath, this.notesPath);

      // Dirent flags do not follow symlinks, so a link out of the root is neither file nor directory.
      if (entry.isDirectory()) {
        const metadata = await this.buildFolderMetadata(entryPath, entry.name, parentId);
        index.set(metadata.id, metadata);
        await this.indexDirectory(entryPath, metadata.id, index);
      } else if (entry.isFile()) {
        const metadata = await this.buildNoteMetadata(entryPath, entry.name, parentId);
        index.set(metadata.id, metadata);
      }
    }
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
      updatedTimestamp: Math.trunc(stats.mtimeMs),
      isReadOnly: true,
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

    return {
      id: toNoteId(relativePath),
      entityType: ENTITY_TYPE.NOTE,
      name: toNoteName(entryName, ENTITY_TYPE.NOTE),
      path: relativePath,
      parentId,
      updatedTimestamp: Math.trunc(stats.mtimeMs),
      isReadOnly: contentType !== NOTE_CONTENT_TYPE.TEXT,
      contentType,
      size: stats.size,
    };
  }
}
