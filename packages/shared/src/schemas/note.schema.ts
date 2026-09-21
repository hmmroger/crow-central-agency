import { z } from "zod";
import { ENTITY_TYPE } from "./agent-circle.schema.js";

/** Entity types that live in the notes tree */
export const NoteEntityTypeSchema = z.enum([ENTITY_TYPE.NOTE, ENTITY_TYPE.NOTE_FOLDER]);

export type NoteEntityType = z.infer<typeof NoteEntityTypeSchema>;

export const NOTE_CONTENT_TYPE = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  UNKNOWN: "UNKNOWN",
} as const;
export type NoteContentType = (typeof NOTE_CONTENT_TYPE)[keyof typeof NOTE_CONTENT_TYPE];

export const NoteContentTypeSchema = z.enum([
  NOTE_CONTENT_TYPE.TEXT,
  NOTE_CONTENT_TYPE.IMAGE,
  NOTE_CONTENT_TYPE.UNKNOWN,
]);

/**
 * Fields shared by every node in the notes tree. All of them are recomputable
 * from a rescan (relative path + stat), which keeps the index a pure cache.
 */
const NoteNodeSchema = z.object({
  /** Relative path, lowercased, with the path separator replaced by `:` */
  id: z.string().min(1),
  /** Cased basename, extension stripped for notes */
  name: z.string().min(1),
  /** Path relative to the notes root */
  path: z.string().min(1),
  /** Undefined for nodes directly under the notes root */
  parentId: z.string().optional(),
  /** stat mtime in epoch milliseconds */
  updatedTimestamp: z.number(),
  isReadOnly: z.boolean(),
});

export const NoteFolderMetadataSchema = NoteNodeSchema.extend({
  entityType: z.literal(ENTITY_TYPE.NOTE_FOLDER),
});

export const NoteFileMetadataSchema = NoteNodeSchema.extend({
  entityType: z.literal(ENTITY_TYPE.NOTE),
  contentType: NoteContentTypeSchema,
  /** File size in bytes */
  size: z.number(),
});

export const NoteMetadataSchema = z.discriminatedUnion("entityType", [
  NoteFolderMetadataSchema,
  NoteFileMetadataSchema,
]);

export type NoteFolderMetadata = z.infer<typeof NoteFolderMetadataSchema>;
export type NoteFileMetadata = z.infer<typeof NoteFileMetadataSchema>;
export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;

/**
 * Content payload of the read-note endpoint. Only text notes are returned as
 * JSON — image and unknown notes are streamed as raw bytes.
 */
export const NoteContentSchema = z.object({
  contentType: z.literal(NOTE_CONTENT_TYPE.TEXT),
  content: z.string(),
  updatedTimestamp: z.number(),
});

export type NoteContent = z.infer<typeof NoteContentSchema>;
