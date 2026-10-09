import { z } from "zod";
import { EntitySchema, EntityTypeSchema } from "./agent-circle.schema.js";

export const TagSchema = z.object({
  id: z.string().min(1),
  /** Normalized name, unique across tags */
  name: z.string().min(1),
  createdTimestamp: z.number(),
});

/** One tagging, identified by its endpoints */
export const TagEdgeSchema = z.object({
  tagId: z.string().min(1),
  entity: EntitySchema,
});

export const TagSnapshotSchema = z.object({
  tags: z.array(TagSchema),
  edges: z.array(TagEdgeSchema),
});

/** Optional entity type filter for the tag snapshot */
export const TagSnapshotQuerySchema = z.object({
  entityType: EntityTypeSchema.optional(),
});

export type Tag = z.infer<typeof TagSchema>;
export type TagEdge = z.infer<typeof TagEdgeSchema>;
export type TagSnapshot = z.infer<typeof TagSnapshotSchema>;
export type TagSnapshotQuery = z.infer<typeof TagSnapshotQuerySchema>;
