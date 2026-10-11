import type { EntityType, Tag } from "@crow-central-agency/shared";
import type { ApiError } from "../services/api-client.types.js";

export interface TagListStatus {
  isLoading: boolean;
  error: ApiError | undefined;
}

/** The ids of the entities tagged with each tag, by entity type */
export type EntityIdsByTagId = ReadonlyMap<string, ReadonlyMap<EntityType, readonly string[]>>;

/** Value exposed by the TagsProvider context: read-only data derived from the cached tag snapshot */
export interface TagsContextValue {
  /** Every tag the server has sent, in name order; a tag may have no edge of a tracked type */
  tags: readonly Tag[];
  /** Holds only the entity types the provider tracks; a tag with no tracked edge has no entry */
  entityIdsByTagId: EntityIdsByTagId;
  listStatus: TagListStatus;
}
