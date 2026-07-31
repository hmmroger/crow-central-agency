import { z } from "zod";
import { ENTITY_TYPE } from "./agent-circle.schema.js";

/**
 * Fragment kinds.
 * DOMAIN - an organizing topic others nest under.
 * KNOWLEDGE - a fact (even one a user tells you); leaf under a DOMAIN.
 * LESSON - a how-to-act rule from the agent's own reflection.
 * FEEDBACK - a correction or preference from the user.
 */
export const FRAGMENT_KIND = {
  FEEDBACK: "FEEDBACK",
  LESSON: "LESSON",
  DOMAIN: "DOMAIN",
  KNOWLEDGE: "KNOWLEDGE",
} as const;

export type FragmentKind = (typeof FRAGMENT_KIND)[keyof typeof FRAGMENT_KIND];

export const FragmentKindSchema = z.enum([
  FRAGMENT_KIND.FEEDBACK,
  FRAGMENT_KIND.LESSON,
  FRAGMENT_KIND.DOMAIN,
  FRAGMENT_KIND.KNOWLEDGE,
]);

/** Maximum number of words in a fragment body, kind-agnostic, enforced on write */
export const FRAGMENT_MAX_WORDS = 100;

/** Target ceiling for a first-level bucket or any parent's direct children before reflection consolidates */
export const FRAGMENT_FIRST_LEVEL_TARGET = 20;

/**
 * An atomic unit of agent experience.
 * Pure: no agent reference and no link fields — agent↔fragment and
 * fragment↔fragment relations are relationship-graph edges only.
 */
export const FragmentSchema = z.object({
  id: z.string().min(1),
  kind: FragmentKindSchema,
  /** Level-1: short one-line relevance descriptor, always cheap to surface */
  cue: z.string().min(1),
  /** Level-2: the lesson itself, pulled on demand */
  body: z.string().min(1),
  /** Times the fragment has been recalled */
  usageCount: z.number(),
  lastRecalledTimestamp: z.number().optional(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
});

export type Fragment = z.infer<typeof FragmentSchema>;

/**
 * The open fragment's role in an edge, from the viewer's perspective.
 * TARGET: the open fragment is the child and the counterpart is its parent.
 * SOURCE: the open fragment is the parent and the counterpart is its child.
 * Crosses the wire only as the relationship-candidates query parameter.
 */
export const RELATIONSHIP_DIRECTION = {
  SOURCE: "source",
  TARGET: "target",
} as const;

export type RelationshipDirection = (typeof RELATIONSHIP_DIRECTION)[keyof typeof RELATIONSHIP_DIRECTION];

export const RelationshipDirectionSchema = z.enum([RELATIONSHIP_DIRECTION.SOURCE, RELATIONSHIP_DIRECTION.TARGET]);

/**
 * A pickable counterpart for a new fragment relationship, returned by the
 * candidates route. Discriminated on entityType: an AGENT carries its display
 * name; a FRAGMENT carries its cue and kind so the picker can group and label.
 */
export const FragmentRelationshipEntitySchema = z.discriminatedUnion("entityType", [
  z.object({
    entityType: z.literal(ENTITY_TYPE.AGENT),
    id: z.string().min(1),
    name: z.string(),
  }),
  z.object({
    entityType: z.literal(ENTITY_TYPE.FRAGMENT),
    id: z.string().min(1),
    cue: z.string(),
    kind: FragmentKindSchema,
  }),
]);

export type FragmentRelationshipEntity = z.infer<typeof FragmentRelationshipEntitySchema>;
