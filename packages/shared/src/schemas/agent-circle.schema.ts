import { z } from "zod";

/**
 * Entity types used in relationship source/target fields.
 */
export const ENTITY_TYPE = {
  AGENT: "AGENT",
  AGENT_CIRCLE: "AGENT_CIRCLE",
  FRAGMENT: "FRAGMENT",
} as const;

export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE];

/**
 * Relationship types between entities.
 * MEMBERSHIP means "source contains target as a member" (agent ↔ circle only).
 * ASSOCIATION anchors an agent to a fragment (agent → fragment).
 * LINK connects fragments (fragment → fragment).
 */
export const RELATIONSHIP_TYPE = {
  MEMBERSHIP: "MEMBERSHIP",
  ASSOCIATION: "ASSOCIATION",
  LINK: "LINK",
} as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPE)[keyof typeof RELATIONSHIP_TYPE];

export const AgentCircleSchema = z.object({
  /** Unique identifier - UUID for user-created circles, well-known string for system circles */
  id: z.string().min(1),
  /** Circle display name */
  name: z.string().min(1).max(64),
  /** Whether this is a built-in system circle (cannot be deleted) */
  isSystemCircle: z.boolean().optional(),
  /** Conventions or rules for the circle that agents should follow */
  convention: z.string().optional(),
  /** Display order for dashboard rendering (lower = first) */
  displayOrder: z.number().optional(),
  createdTimestamp: z.number(),
  updatedTimestamp: z.number(),
});

export type AgentCircle = z.infer<typeof AgentCircleSchema>;

export const CreateAgentCircleInputSchema = z.object({
  name: z.string().min(1).max(64),
  convention: z.string().optional(),
  displayOrder: z.number().optional(),
});

export type CreateAgentCircleInput = z.infer<typeof CreateAgentCircleInputSchema>;

export const UpdateAgentCircleInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  convention: z.string().optional(),
  displayOrder: z.number().optional(),
});

export type UpdateAgentCircleInput = z.infer<typeof UpdateAgentCircleInputSchema>;

export const EntityTypeSchema = z.enum([ENTITY_TYPE.AGENT, ENTITY_TYPE.AGENT_CIRCLE, ENTITY_TYPE.FRAGMENT]);

export const RelationshipTypeSchema = z.enum([
  RELATIONSHIP_TYPE.MEMBERSHIP,
  RELATIONSHIP_TYPE.ASSOCIATION,
  RELATIONSHIP_TYPE.LINK,
]);

export const RelationshipSchema = z.object({
  /** Unique identifier - UUID except for virtual relationship with system agents */
  id: z.string().min(1),
  sourceEntityId: z.string(),
  sourceEntityType: EntityTypeSchema,
  targetEntityId: z.string(),
  targetEntityType: EntityTypeSchema,
  relationshipType: RelationshipTypeSchema,
  createdTimestamp: z.number(),
});

export type Relationship = z.infer<typeof RelationshipSchema>;

export const CreateRelationshipInputSchema = z.object({
  sourceEntityId: z.string(),
  sourceEntityType: EntityTypeSchema,
  targetEntityId: z.string(),
  targetEntityType: EntityTypeSchema,
  relationshipType: RelationshipTypeSchema,
});

export type CreateRelationshipInput = z.infer<typeof CreateRelationshipInputSchema>;

export const DeleteRelationshipResultSchema = z.object({
  /** Fragment ids removed by the delete cascade; empty for MEMBERSHIP deletes */
  collectedFragmentIds: z.array(z.string()),
});

export type DeleteRelationshipResult = z.infer<typeof DeleteRelationshipResultSchema>;

export const CircleMemberSchema = z.object({
  relationshipId: z.string(),
  entityId: z.string(),
  entityType: EntityTypeSchema,
});

export type CircleMember = z.infer<typeof CircleMemberSchema>;
