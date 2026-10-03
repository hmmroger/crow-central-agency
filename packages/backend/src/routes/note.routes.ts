import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CreateNoteInputSchema,
  ENTITY_TYPE,
  getMimeTypeByFilename,
  NOTE_CONTENT_TYPE,
  UpdateNoteInputSchema,
  WriteNoteContentInputSchema,
  type NoteContent,
  type NoteMetadata,
} from "@crow-central-agency/shared";
import { AppError } from "../core/error/app-error.js";
import { APP_ERROR_CODES } from "../core/error/app-error.types.js";
import type { NotesManager } from "../services/notes/notes-manager.js";
import type { ReadNoteResult } from "../services/notes/notes-manager.types.js";
import { deletedResponse, wrapZodError } from "./route-utils.js";

const DEFAULT_MIME_TYPE = "application/octet-stream";

/**
 * Listing and emptying the trash are container operations, so they keep their
 * own resource. Everything addressed by id lives under `/api/notes`, where a
 * `.trash:` id resolves to exactly one note.
 */
const TRASH_ROUTE = "/api/note-trash";

/** JSON for text notes, raw bytes with a Content-Type header otherwise. */
function sendNoteContent(reply: FastifyReply, { metadata, content }: ReadNoteResult) {
  if (Buffer.isBuffer(content)) {
    return reply.type(getMimeTypeByFilename(metadata.path) ?? DEFAULT_MIME_TYPE).send(content);
  }

  const data: NoteContent = {
    contentType: NOTE_CONTENT_TYPE.TEXT,
    content,
    updatedTimestamp: metadata.updatedTimestamp,
  };

  return { success: true, data };
}

/**
 * Register note REST routes. Note ids are URL-encoded in paths.
 */
export async function registerNoteRoutes(server: FastifyInstance, notesManager: NotesManager) {
  /** List the live note tree as a flat array */
  server.get("/api/notes", async () => {
    return { success: true, data: notesManager.getTree() };
  });

  /** Create a folder or a text note */
  server.post<{ Body: unknown }>("/api/notes", async (request) => {
    try {
      const input = CreateNoteInputSchema.parse(request.body);
      const metadata: NoteMetadata =
        input.entityType === ENTITY_TYPE.NOTE_FOLDER
          ? await notesManager.createFolder(input.parentId, input.name)
          : await notesManager.createTextNote(input.parentId, input.name, input.content);

      return { success: true, data: metadata };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Rename and/or move a note or folder */
  server.patch<{ Params: { id: string }; Body: unknown }>("/api/notes/:id", async (request) => {
    try {
      const input = UpdateNoteInputSchema.parse(request.body);
      const metadata = await notesManager.renameOrMove(request.params.id, input);

      return { success: true, data: metadata };
    } catch (error) {
      return wrapZodError(error);
    }
  });

  /** Save one uploaded image into the `assets` folder beside a text note */
  server.post<{ Params: { id: string } }>("/api/notes/:id/assets", async (request) => {
    const file = await request.file();
    if (!file) {
      throw new AppError("No file provided", APP_ERROR_CODES.VALIDATION);
    }

    const metadata = await notesManager.createImageAsset(request.params.id, file.mimetype, await file.toBuffer());

    return { success: true, data: metadata };
  });

  /** List the trash tree as a flat array */
  server.get(TRASH_ROUTE, async () => {
    return { success: true, data: notesManager.getTrashTree() };
  });

  /** Restore a trashed note to the path it was deleted from */
  server.post<{ Params: { id: string } }>("/api/notes/:id/restore", async (request) => {
    const metadata = await notesManager.restoreNote(request.params.id);

    return { success: true, data: metadata };
  });

  /** Permanently remove everything in the trash */
  server.delete(TRASH_ROUTE, async () => {
    await notesManager.emptyTrash();

    return deletedResponse();
  });

  /** Delete by location: a live note moves to the trash, a trashed one is purged */
  server.delete<{ Params: { id: string } }>("/api/notes/:id", async (request) => {
    await notesManager.deleteNote(request.params.id);

    return deletedResponse();
  });

  /** Read any note by id — a trashed one is served read-only where it lies */
  server.get<{ Params: { id: string } }>("/api/notes/:id/content", async (request, reply) => {
    return sendNoteContent(reply, await notesManager.getNoteContent(request.params.id));
  });

  /** Replace a text note's content, guarded by its updatedTimestamp token */
  server.put<{ Params: { id: string }; Body: unknown }>("/api/notes/:id/content", async (request) => {
    try {
      const input = WriteNoteContentInputSchema.parse(request.body);
      const metadata = await notesManager.writeNoteContent(request.params.id, input.content, input.updatedTimestamp);

      return { success: true, data: metadata };
    } catch (error) {
      return wrapZodError(error);
    }
  });
}
