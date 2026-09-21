import type { FastifyInstance } from "fastify";
import { NOTE_CONTENT_TYPE, type NoteContent } from "@crow-central-agency/shared";
import type { NotesManager } from "../services/notes/notes-manager.js";
import { getMimeTypeByFilename } from "../utils/mime-type.js";

const DEFAULT_MIME_TYPE = "application/octet-stream";

/**
 * Register note REST routes. Note ids are URL-encoded in paths.
 */
export async function registerNoteRoutes(server: FastifyInstance, notesManager: NotesManager) {
  /** List the live note tree as a flat array */
  server.get("/api/notes", async () => {
    return { success: true, data: notesManager.getTree() };
  });

  /** Read a note — JSON for text notes, raw bytes with a Content-Type header otherwise */
  server.get<{ Params: { id: string } }>("/api/notes/:id/content", async (request, reply) => {
    const { metadata, content } = await notesManager.getNoteContent(request.params.id);
    if (Buffer.isBuffer(content)) {
      return reply.type(getMimeTypeByFilename(metadata.path) ?? DEFAULT_MIME_TYPE).send(content);
    }

    const data: NoteContent = {
      contentType: NOTE_CONTENT_TYPE.TEXT,
      content,
      updatedTimestamp: metadata.updatedTimestamp,
    };

    return { success: true, data };
  });
}
