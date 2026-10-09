import { z } from "zod";

export const DATA_SOURCE_TYPE = {
  ARTIFACT: "artifact",
  CIRCLE_ARTIFACT: "circleArtifact",
  TASK: "task",
  FRAGMENT: "fragment",
  NOTE: "note",
} as const;
export type DataSourceType = (typeof DATA_SOURCE_TYPE)[keyof typeof DATA_SOURCE_TYPE];

export const DataSourceTypeSchema = z.enum(DATA_SOURCE_TYPE);

export const SEARCH_DEFAULT_LIMIT = 25;
export const SEARCH_MAX_LIMIT = 200;

/** `sources` may repeat in the query string; a single value arrives as a plain string. Omitted means every source. */
export const SearchQuerySchema = z.object({
  query: z.string().trim().min(1),
  sources: z
    .union([DataSourceTypeSchema.transform((source) => [source]), z.array(DataSourceTypeSchema).min(1)])
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(SEARCH_DEFAULT_LIMIT)
    .transform((limit) => Math.min(limit, SEARCH_MAX_LIMIT)),
});

export type SearchQuery = z.output<typeof SearchQuerySchema>;

/**
 * Provenance for documents that share one global pool instead of belonging to an agent or
 * circle container. A task uses this: its id is already globally unique, and its owner is an
 * assignee rather than a container, so there is no per-container provenance to record.
 */
export const GLOBAL_PROVENANCE_ID = "global";

/**
 * Identity of a searchable document. A `documentId` is unique only within its (`dataSourceType`,
 * `provenanceId`) pair. `provenanceId` is the container the document belongs to: the owner
 * agentId for an artifact, the circleId for a circleArtifact, and `GLOBAL_PROVENANCE_ID` for a
 * task, fragment or note.
 */
export const DocumentRefSchema = z.object({
  documentId: z.string(),
  dataSourceType: DataSourceTypeSchema,
  provenanceId: z.string(),
});

export type DocumentRef = z.infer<typeof DocumentRefSchema>;

export const DocumentSearchHitSchema = DocumentRefSchema.extend({
  title: z.string(),
  tags: z.array(z.string()).optional(),
  score: z.number(),
});

export type DocumentSearchHit = z.infer<typeof DocumentSearchHitSchema>;
