import { z } from "zod";
import { FragmentKindSchema } from "./fragment.schema.js";

/**
 * A plan node reference is a single string.
 * `REFLECTION_AGENT_REF` names the target agent (top-level anchor).
 * A string starting with `REFLECTION_TEMP_PREFIX` names a node created earlier in the same plan by its tempId.
 * Anything else is an existing fragment id.
 */
export const REFLECTION_AGENT_REF = "agent";
export const REFLECTION_TEMP_PREFIX = "$";

const NodeRefSchema = z.string().min(1);

/**
 * Reflection plan operations, applied in order against the target agent's memory fragments.
 * CREATE - a new node (theme/sub-domain) hanging under `parent`.
 * LINK - add an edge, or move when `from` names the edge to drop.
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
  /** Handle later operations in the same plan use to reference this node — must start with `$` */
  tempId: z.string().regex(/^\$/),
  kind: FragmentKindSchema,
  cue: z.string().min(1),
  body: z.string().min(1),
  parent: NodeRefSchema,
});

const LinkReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.LINK),
  fragment: NodeRefSchema,
  parent: NodeRefSchema,
  /** When given, the move drops this original parent edge after the new one is added */
  from: NodeRefSchema.optional(),
});

const UnlinkReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.UNLINK),
  fragment: NodeRefSchema,
  parent: NodeRefSchema,
});

const UpdateReflectionOpSchema = z.object({
  op: z.literal(REFLECTION_OP.UPDATE),
  fragment: NodeRefSchema,
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
