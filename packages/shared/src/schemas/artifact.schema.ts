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
  filename: z.string(),
  type: ArtifactTypeSchema,
  contentType: ArtifactContentTypeSchema,
  entityId: z.string(),
  entityType: EntityTypeSchema,
  size: z.number(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
  createdBy: AgentTaskSourceSchema,
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;
