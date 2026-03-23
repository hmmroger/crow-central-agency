import { z } from "zod";

/**
 * Schema for artifact file metadata
 */
export const ArtifactMetadataSchema = z.object({
  filename: z.string(),
  agentId: z.string(),
  size: z.number(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;
