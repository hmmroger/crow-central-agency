import type { Entity, Relationship } from "@crow-central-agency/shared";

/** The full target set one source entity should have edges to */
export interface RelationshipTargets {
  source: Entity;
  targets: readonly Entity[];
}

/** The edges a replace created and deleted */
export interface ReplacedRelationships {
  created: Relationship[];
  deleted: Relationship[];
}

/** One relationship moved by an entity re-key; the id is kept */
export interface RekeyedRelationship {
  previous: Relationship;
  next: Relationship;
}
