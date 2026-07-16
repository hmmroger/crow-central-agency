import { z } from "zod";
import { ENTITY_TYPE } from "./agent-circle.schema.js";
import { AgentTaskSourceSchema } from "./agent-task.schema.js";

/** Entity types that can own artifacts — fragments are never artifact-bearing */
export const ArtifactEntityTypeSchema = z.enum([ENTITY_TYPE.AGENT, ENTITY_TYPE.AGENT_CIRCLE]);

export type ArtifactEntityType = z.infer<typeof ArtifactEntityTypeSchema>;

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
  entityType: ArtifactEntityTypeSchema,
  size: z.number(),
  tags: z.array(z.string()).optional(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
  createdBy: AgentTaskSourceSchema,
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;

/**
 * Request body for a PATCH artifact update. Tag changes apply a remove-then-add delta to the current
 * set; `content` replaces the raw text. `expectedUpdatedTimestamp` guards against clobbering a
 * concurrent edit — the update is rejected with a conflict when it no longer matches the stored
 * timestamp. At least one of addTags/removeTags/content must be present, and a content replacement
 * must carry the expected timestamp.
 */
export const ArtifactUpdateSchema = z
  .object({
    addTags: z.array(z.string()).optional(),
    removeTags: z.array(z.string()).optional(),
    content: z.string().optional(),
    expectedUpdatedTimestamp: z.number().optional(),
  })
  .superRefine((update, ctx) => {
    if ((update.addTags?.length ?? 0) === 0 && (update.removeTags?.length ?? 0) === 0 && update.content === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "At least one of addTags, removeTags, or content is required",
      });
    }

    if (update.content !== undefined && update.expectedUpdatedTimestamp === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "expectedUpdatedTimestamp is required when content is provided",
        path: ["expectedUpdatedTimestamp"],
      });
    }
  });

export type ArtifactUpdate = z.infer<typeof ArtifactUpdateSchema>;
