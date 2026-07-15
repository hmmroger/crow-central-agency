import { z } from "zod";
import { FragmentKindSchema } from "./fragment.schema.js";

/**
 * How a reflection plan operation refers to a graph node.
 * FRAGMENT - an existing fragment by id.
 * TEMP - a node created earlier in the same plan, by its tempId.
 * AGENT - the target agent itself, for a top-level anchor.
 */
export const REFLECTION_NODE_REF = {
  FRAGMENT: "fragment",
  TEMP: "temp",
  AGENT: "agent",
} as const;

export type ReflectionNodeRefType = (typeof REFLECTION_NODE_REF)[keyof typeof REFLECTION_NODE_REF];

const FragmentNodeRefSchema = z.object({
  ref: z.literal(REFLECTION_NODE_REF.FRAGMENT),
  id: z.string().min(1),
});

const TempNodeRefSchema = z.object({
  ref: z.literal(REFLECTION_NODE_REF.TEMP),
  tempId: z.string().min(1),
});

const AgentNodeRefSchema = z.object({
  ref: z.literal(REFLECTION_NODE_REF.AGENT),
});

export const ReflectionNodeRefSchema = z.discriminatedUnion("ref", [
  FragmentNodeRefSchema,
  TempNodeRefSchema,
  AgentNodeRefSchema,
]);

export type ReflectionNodeRef = z.infer<typeof ReflectionNodeRefSchema>;

/**
 * Reflection plan operations, applied in order against the target agent's vault.
 * CREATE - a new node (theme/sub-domain) hanging under `source`.
 * LINK - add an edge, or move when `original` names the edge to drop.
 * UNLINK - remove one named edge (last-edge removal cascade-deletes).
 * UPDATE - content only (cue/body).
 */
export const REFLECTION_OP = {
  CREATE: "create",
  LINK: "link",
  UNLINK: "unlink",
  UPDATE: "update",
} as const;

export type ReflectionOpType = (typeof REFLECTION_OP)[keyof typeof REFLECTION_OP];

const CreateReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.CREATE),
  /** Handle later operations in the same plan use to reference this node */
  tempId: z.string().min(1),
  kind: FragmentKindSchema,
  cue: z.string().min(1),
  body: z.string().min(1),
  source: ReflectionNodeRefSchema,
});

const LinkReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.LINK),
  fragment: ReflectionNodeRefSchema,
  target: ReflectionNodeRefSchema,
  /** When given, the move drops this original edge after the new one is added */
  original: ReflectionNodeRefSchema.optional(),
});

const UnlinkReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.UNLINK),
  fragment: ReflectionNodeRefSchema,
  source: ReflectionNodeRefSchema,
});

const UpdateReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.UPDATE),
  fragment: ReflectionNodeRefSchema,
  cue: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export const ReflectionOpSchema = z.discriminatedUnion("op", [
  CreateReflectionOpSchema,
  LinkReflectionOpSchema,
  UnlinkReflectionOpSchema,
  UpdateReflectionOpSchema,
]);

export type ReflectionOp = z.infer<typeof ReflectionOpSchema>;

/** The single-pass reorganization plan the reflection agent returns between its output markers */
export const ReflectionPlanSchema = z.object({
  operations: z.array(ReflectionOpSchema),
});

export type ReflectionPlan = z.infer<typeof ReflectionPlanSchema>;
