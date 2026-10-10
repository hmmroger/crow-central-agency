import type { EntityType, Tag } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

export interface TagListStatus {
  isLoading: boolean;
  error: ApiError | undefined;
}

/** Value exposed by the TagsProvider context: read-only tag accessors, never the index itself */
export interface TagsContextValue {
  /** Every tag the server has sent, in name order; a tag may have no edge of a tracked type */
  getTags: () => Tag[];
  /** Ids of the entities of `entityType` tagged with the tag; always empty for a type the provider does not track */
  getEntityIds: (tagId: string, entityType: EntityType) => string[];
  listStatus: TagListStatus;
}
