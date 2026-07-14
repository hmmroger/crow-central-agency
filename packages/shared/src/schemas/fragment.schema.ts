import { z } from "zod";

/**
 * Fragment kinds.
 * FEEDBACK - an atomic piece of user feedback.
 * LESSON - an atomic lesson from the agent's own work outcomes.
 * DOMAIN - an area worked in / organized around; the signpost KNOWLEDGE hangs under.
 * KNOWLEDGE - a specific fact; a leaf under a DOMAIN.
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

/** Target ceiling for a first-level bucket or any parent's direct children before the curator consolidates */
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

/** Input for the user-facing sharing route: associate an agent to a fragment */
export const CreateFragmentAssociationInputSchema = z.object({
  agentId: z.string().min(1),
});

export type CreateFragmentAssociationInput = z.infer<typeof CreateFragmentAssociationInputSchema>;
