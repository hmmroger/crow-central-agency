import type { EntityType, Tag } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

export interface TagListStatus {
  isLoading: boolean;
  error: ApiError | undefined;
}

/** Value exposed by the TagsProvider context: read-only tag accessors, never the index itself */
export interface TagsContextValue {
  /** Every tag with at least one tracked edge, in name order */
  getTags: () => Tag[];
  /** Ids of the entities of `entityType` tagged with the tag; always empty for a type the provider does not track */
  getEntityIds: (tagId: string, entityType: EntityType) => string[];
  listStatus: TagListStatus;
}
