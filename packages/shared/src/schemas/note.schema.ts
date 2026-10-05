import { z } from "zod";
import { MIME_TYPE } from "../utils/mime-type.js";
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
 * Fields shared by every note, file or folder. All of them are recomputable
 * from a rescan (relative path + stat), which keeps the index a pure cache.
 */
const NoteBaseSchema = z.object({
  /** Relative path, lowercased, with the path separator replaced by `:` */
  id: z.string().min(1),
  /** Cased basename, extension stripped for text notes only */
  name: z.string().min(1),
  /** Path relative to the notes root; a trashed note keeps its `.trash/` prefix */
  path: z.string().min(1),
  /** Undefined for notes directly under the notes root */
  parentId: z.string().optional(),
  updatedTimestamp: z.number(),
  isReadOnly: z.boolean(),
  isTrashed: z.boolean(),
});

export const NoteFolderMetadataSchema = NoteBaseSchema.extend({
  entityType: z.literal(ENTITY_TYPE.NOTE_FOLDER),
});

export const NoteFileMetadataSchema = NoteBaseSchema.extend({
  entityType: z.literal(ENTITY_TYPE.NOTE),
  contentType: NoteContentTypeSchema,
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

export const NOTE_NAME_MAX_LENGTH = 128;

/** Image types a note accepts as an uploaded asset. SVG is left out on purpose: it can carry script. */
export const NOTE_IMAGE_ASSET_MIME_TYPES: ReadonlySet<string> = new Set([
  MIME_TYPE.PNG,
  MIME_TYPE.JPEG,
  MIME_TYPE.GIF,
  MIME_TYPE.WEBP,
]);

/** Create a folder, or a text note whose file is `<name>.md`. `parentId` omitted means the notes root. */
export const CreateNoteInputSchema = z.object({
  parentId: z.string().min(1).optional(),
  name: z.string().min(1).max(NOTE_NAME_MAX_LENGTH),
  entityType: NoteEntityTypeSchema,
  content: z.string().optional(),
});

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

/**
 * Rename and/or move a note. An omitted field is left unchanged; a `null`
 * `parentId` moves the note to the notes root.
 */
export const UpdateNoteInputSchema = z
  .object({
    name: z.string().min(1).max(NOTE_NAME_MAX_LENGTH).optional(),
    parentId: z.string().min(1).nullable().optional(),
  })
  .superRefine((update, ctx) => {
    if (update.name === undefined && update.parentId === undefined) {
      ctx.addIssue({ code: "custom", message: "At least one of name or parentId is required" });
    }
  });

export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;

/** `updatedTimestamp` is the optimistic-concurrency token taken from the last read or write. */
export const WriteNoteContentInputSchema = z.object({
  content: z.string(),
  updatedTimestamp: z.number(),
});

export type WriteNoteContentInput = z.infer<typeof WriteNoteContentInputSchema>;

export const WIKILINK_RESOLVE_MAX_TARGETS = 1000;

export const ResolveWikilinkBatchInputSchema = z.object({
  targets: z.array(z.string()).max(WIKILINK_RESOLVE_MAX_TARGETS),
});

export type ResolveWikilinkBatchInput = z.infer<typeof ResolveWikilinkBatchInputSchema>;

/** What one target names; `note` is absent when it names nothing. */
export const WikilinkResolutionSchema = z.object({
  target: z.string(),
  note: NoteMetadataSchema.optional(),
});

export type WikilinkResolution = z.infer<typeof WikilinkResolutionSchema>;

/** Open the note a target names, creating it (and any missing folders) when it names nothing. */
export const ResolveWikilinkInputSchema = z.object({
  target: z.string().min(1),
  sourceNoteId: z.string().min(1),
});

export type ResolveWikilinkInput = z.infer<typeof ResolveWikilinkInputSchema>;

export const SuggestWikilinksQuerySchema = z.object({
  query: z.string().default(""),
  isEmbed: z.stringbool().default(false),
  excludeId: z.string().min(1).optional(),
});

export type SuggestWikilinksQuery = z.output<typeof SuggestWikilinksQuerySchema>;

/** `target` is the shortest unescaped target that names `note`. */
export const WikilinkSuggestionSchema = z.object({
  note: NoteFileMetadataSchema,
  folderPath: z.string().optional(),
  target: z.string(),
});

export type WikilinkSuggestion = z.infer<typeof WikilinkSuggestionSchema>;

export const NoteImageAssetSchema = z.object({
  note: NoteMetadataSchema,
  target: z.string(),
});

export type NoteImageAsset = z.infer<typeof NoteImageAssetSchema>;
