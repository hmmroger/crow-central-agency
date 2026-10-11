import type { Entity, TagsChangedWsMessage } from "@crow-central-agency/shared";

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

/** The edge changes of one tag mutation; TAGS_CHANGED adds the tag records the added edges point at */
export type TagChange = Omit<TagsChangedWsMessage, "type" | "tags">;
