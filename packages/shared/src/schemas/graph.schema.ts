import { z } from "zod";
import { EntityTypeSchema, RelationshipTypeSchema } from "./agent-circle.schema.js";
import { AGENT_STATUS } from "./agent-runtime-state.schema.js";
import { FragmentKindSchema } from "./fragment.schema.js";

/** A user-authored layout position for a graph node; `id` is the node's entity id */
export const GraphNodePositionSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
});

export type GraphNodePosition = z.infer<typeof GraphNodePositionSchema>;

/** A node in the relationship graph — represents an agent, a circle, or a fragment */
export const GraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  entityType: EntityTypeSchema,
  isSystemAgent: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isSystemCircle: z.boolean().optional(),
  kind: FragmentKindSchema.optional(),
  status: z
    .enum([AGENT_STATUS.IDLE, AGENT_STATUS.ACTIVATING, AGENT_STATUS.STREAMING, AGENT_STATUS.COMPACTING])
    .optional(),
  x: z.number().optional(),
  y: z.number().optional(),
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
