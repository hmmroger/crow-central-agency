import type { TagsChangedWsMessage } from "@crow-central-agency/shared";

/** A TAGGED edge to create once its tag record exists */
export interface PendingTagEdge {
  entityId: string;
  tagName: string;
}

/** The changes of one tag mutation, as broadcast in TAGS_CHANGED */
export type TagChange = Omit<TagsChangedWsMessage, "type">;
