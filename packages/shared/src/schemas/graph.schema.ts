import { z } from "zod";
import { EntityTypeSchema, RelationshipTypeSchema } from "./agent-circle.schema.js";
import { AGENT_STATUS } from "./agent-runtime-state.schema.js";

/** A node in the relationship graph — represents either an agent or a circle */
export const GraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: EntityTypeSchema,
  isSystemAgent: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isSystemCircle: z.boolean().optional(),
  status: z
    .enum([AGENT_STATUS.IDLE, AGENT_STATUS.ACTIVATING, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING])
    .optional(),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

/** An edge in the relationship graph — represents a membership relationship */
export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  relationshipType: RelationshipTypeSchema,
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

/** Complete graph data returned by GET /api/graph */
export const GraphDataSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export type GraphData = z.infer<typeof GraphDataSchema>;
