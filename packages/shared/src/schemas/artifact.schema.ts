import { z } from "zod";
import { EntityTypeSchema } from "./agent-circle.schema.js";
import { AgentTaskSourceSchema } from "./agent-task.schema.js";

/**
 * TODO: layered memory system via artifacts.
 */
export const ARTIFACT_TYPE = {
  STANDARD: "STANDARD",
  TEMPORARY: "TEMPORARY",
  STRONG: "STRONG",
  NEAR: "NEAR",
  LOOSE: "LOOSE",
  USER: "USER",
} as const;
export type ArtifactType = (typeof ARTIFACT_TYPE)[keyof typeof ARTIFACT_TYPE];

export const ARTIFACT_CONTENT_TYPE = {
  TEXT: "TEXT",
  BINARY: "BINARY",
  IMAGE: "IMAGE",
  AUDIO: "AUDIO",
} as const;
export type ArtifactContentType = (typeof ARTIFACT_CONTENT_TYPE)[keyof typeof ARTIFACT_CONTENT_TYPE];

export const ArtifactTypeSchema = z.enum([
  ARTIFACT_TYPE.STANDARD,
  ARTIFACT_TYPE.TEMPORARY,
  ARTIFACT_TYPE.STRONG,
  ARTIFACT_TYPE.NEAR,
  ARTIFACT_TYPE.LOOSE,
  ARTIFACT_TYPE.USER,
]);

export const ArtifactContentTypeSchema = z.enum([
  ARTIFACT_CONTENT_TYPE.TEXT,
  ARTIFACT_CONTENT_TYPE.BINARY,
  ARTIFACT_CONTENT_TYPE.IMAGE,
  ARTIFACT_CONTENT_TYPE.AUDIO,
]);

/**
 * Schema for artifact file metadata
 */
export const ArtifactMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  type: ArtifactTypeSchema,
  contentType: ArtifactContentTypeSchema,
  entityId: z.string(),
  entityType: EntityTypeSchema,
  size: z.number(),
  tags: z.array(z.string()).optional(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
  createdBy: AgentTaskSourceSchema,
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

/**
 * Request body for updating an artifact's tags. Applies a remove-then-add delta to the
 * current tag set; at least one of addTags/removeTags must be non-empty.
 */
export const ArtifactTagsUpdateSchema = z.object({
  addTags: z.array(z.string()).optional(),
  removeTags: z.array(z.string()).optional(),
});

export type ArtifactTagsUpdate = z.infer<typeof ArtifactTagsUpdateSchema>;

/**
 * Request body for a PATCH artifact update. Superset of the tags delta that additionally allows
 * replacing the raw text content. `expectedUpdatedTimestamp` guards against clobbering a concurrent
 * edit — the update is rejected with a conflict when it no longer matches the stored timestamp.
 * At least one of addTags/removeTags/content must be present.
 */
export const ArtifactUpdateSchema = ArtifactTagsUpdateSchema.extend({
  content: z.string().optional(),
  expectedUpdatedTimestamp: z.number().optional(),
});

export type ArtifactUpdate = z.infer<typeof ArtifactUpdateSchema>;
