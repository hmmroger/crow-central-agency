import type { CreateRelationshipInput, Relationship } from "@crow-central-agency/shared";

/** Filter options for querying relationships; provided fields are AND-combined */
export type QueryRelationshipOptions = Partial<CreateRelationshipInput>;

/** One relationship moved by an entity re-key; the id is kept */
export interface RekeyedRelationship {
  previous: Relationship;
  next: Relationship;
}
