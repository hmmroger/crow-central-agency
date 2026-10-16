import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ENTITY_TYPE,
  RELATIONSHIP_TYPE,
  SERVER_MESSAGE_TYPE,
  type EntityType,
  type Relationship,
  type RelationshipQuery,
  type Tag,
  type TagsChangedWsMessage,
} from "@crow-central-agency/shared";
import { useWs } from "../hooks/use-ws.js";
import { useRelationshipsQuery } from "../hooks/queries/use-relationships-query.js";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import type { ApiError } from "../services/api-client.types.js";
import { tagKeys } from "../services/query-keys.js";
import { WS_STATE } from "../services/ws-client.types.js";
import type { EntityIdsByTagId, TagListStatus, TagsContextValue } from "./tags-provider.types.js";

const TAGS_PATH = "/tags";
const NOTE_TAG_RELATIONSHIP_QUERY: RelationshipQuery = {
  relationshipType: RELATIONSHIP_TYPE.TAGGED,
  sourceEntityType: ENTITY_TYPE.NOTE,
};

const TagsContext = createContext<TagsContextValue | undefined>(undefined);

/**
 * The one owner of tag data. The query caches hold the only copies: tag records,
 * patched by TAGS_CHANGED, and note TAGGED edges, patched by RELATIONSHIPS_CHANGED.
 * Both reload on WS reconnect. Lookups are derived from the two caches.
 */
export function TagsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();

  const tagsQuery = useQuery<Tag[], ApiError>({
    queryKey: tagKeys.list(),
    queryFn: async () => unwrapResponse(await apiClient.get<Tag[]>(TAGS_PATH)),
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  const edgesQuery = useRelationshipsQuery(NOTE_TAG_RELATIONSHIP_QUERY);

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.TAGS_CHANGED) {
        queryClient.setQueryData<Tag[]>(tagKeys.list(), (previous) =>
          previous ? applyTagsChanged(previous, message) : previous
        );
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  // Events sent while disconnected are lost, so the tags are reloaded.
  const previousStateRef = useRef(connectionState);
  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = connectionState;

    if (
      connectionState === WS_STATE.CONNECTED &&
      (previousState === WS_STATE.RECONNECTING || previousState === WS_STATE.DISCONNECTED)
    ) {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    }
  }, [connectionState, queryClient]);

  const sortedTags = useMemo(
    () => (tagsQuery.data ?? []).toSorted((first, second) => first.name.localeCompare(second.name)),
    [tagsQuery.data]
  );

  const entityIdsByTagId = useMemo(
    () => groupEntityIds(edgesQuery.data ?? [], tagsQuery.data ?? []),
    [edgesQuery.data, tagsQuery.data]
  );

  const listStatus = useMemo<TagListStatus>(
    () => ({
      isLoading: tagsQuery.isLoading || edgesQuery.isLoading,
      error: tagsQuery.error ?? edgesQuery.error ?? undefined,
    }),
    [tagsQuery.isLoading, edgesQuery.isLoading, tagsQuery.error, edgesQuery.error]
  );

  const value = useMemo<TagsContextValue>(
    () => ({ tags: sortedTags, entityIdsByTagId, listStatus }),
    [sortedTags, entityIdsByTagId, listStatus]
  );

  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

/**
 * Access the tags context.
 * Must be used within a TagsProvider.
 */
export function useTagsContext(): TagsContextValue {
  const context = useContext(TagsContext);
  if (!context) {
    throw new Error("useTagsContext must be used within a TagsProvider");
  }

  return context;
}

/** A new tag list with one TAGS_CHANGED applied: upserted tags replace their ids, deleted ids are removed */
function applyTagsChanged(tags: readonly Tag[], message: TagsChangedWsMessage): Tag[] {
  const changedIds = new Set(message.deletedIds.concat(message.upserted.map((tag) => tag.id)));

  return tags.filter((tag) => !changedIds.has(tag.id)).concat(message.upserted);
}

/** The tagged entity ids of each loaded tag; an edge whose tag isn't loaded is skipped */
function groupEntityIds(edges: readonly Relationship[], tags: readonly Tag[]): EntityIdsByTagId {
  const loadedTagIds = new Set(tags.map((tag) => tag.id));
  const entityIdsByTagId = new Map<string, Map<EntityType, string[]>>();
  for (const edge of edges) {
    if (!loadedTagIds.has(edge.targetEntityId)) {
      continue;
    }

    let entityIdsByType = entityIdsByTagId.get(edge.targetEntityId);
    if (!entityIdsByType) {
      entityIdsByType = new Map();
      entityIdsByTagId.set(edge.targetEntityId, entityIdsByType);
    }

    const entityIds = entityIdsByType.get(edge.sourceEntityType);
    if (entityIds) {
      entityIds.push(edge.sourceEntityId);
    } else {
      entityIdsByType.set(edge.sourceEntityType, [edge.sourceEntityId]);
    }
  }

  return entityIdsByTagId;
}
