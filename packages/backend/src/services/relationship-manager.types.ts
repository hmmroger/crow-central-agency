import type { Relationship } from "@crow-central-agency/shared";

/** One relationship moved by an entity re-key; the id is kept */
export interface RekeyedRelationship {
  previous: Relationship;
  next: Relationship;
}
