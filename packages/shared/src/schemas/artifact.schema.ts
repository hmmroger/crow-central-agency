import { z } from "zod";

/**
 * Schema for artifact file metadata
 */
export const ArtifactMetadataSchema = z.object({
  filename: z.string(),
  agentId: z.string(),
  size: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;
