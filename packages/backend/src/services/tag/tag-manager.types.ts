import type { Entity } from "@crow-central-agency/shared";

/** The tag names to set on one entity */
export interface EntityTagNames {
  entity: Entity;
  tagNames: string[];
}

/** A TAGGED edge to create once its tag record exists */
export interface PendingTagEdge {
  entity: Entity;
  tagName: string;
}
