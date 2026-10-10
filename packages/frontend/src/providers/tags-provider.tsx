import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ENTITY_TYPE,
  SERVER_MESSAGE_TYPE,
  type EntityType,
  type TagEdge,
  type TagSnapshot,
  type TagsChangedWsMessage,
} from "@crow-central-agency/shared";
import { useWs } from "../hooks/use-ws.js";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import type { ApiError } from "../services/api-client.types.js";
import { tagKeys } from "../services/query-keys.js";
import { WS_STATE } from "../services/ws-client.types.js";
import type { TagListStatus, TagsContextValue } from "./tags-provider.types.js";

type EntityIdsByTagId = ReadonlyMap<string, ReadonlyMap<EntityType, string[]>>;

const TAGS_PATH = "/tags";
const SNAPSHOT_ENTITY_TYPE = ENTITY_TYPE.NOTE;
const EMPTY_ENTITY_IDS: string[] = [];

const TagsContext = createContext<TagsContextValue | undefined>(undefined);

/**
 * The one owner of tag data. The query cache holds the only copy of the tag
 * snapshot: TAGS_CHANGED patches it in place of a refetch, and a WS reconnect
 * reloads it. Lookups are derived from the cached snapshot.
 */
export function TagsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();

  const snapshotQuery = useQuery<TagSnapshot, ApiError>({
    queryKey: tagKeys.snapshot(SNAPSHOT_ENTITY_TYPE),
    queryFn: async () => {
      const params = new URLSearchParams({ entityType: SNAPSHOT_ENTITY_TYPE });

      return unwrapResponse(await apiClient.get<TagSnapshot>(`${TAGS_PATH}?${params.toString()}`));
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.TAGS_CHANGED) {
        queryClient.setQueryData<TagSnapshot>(tagKeys.snapshot(SNAPSHOT_ENTITY_TYPE), (previous) =>
          previous ? applyTagsChanged(previous, message) : previous
        );
      }
    });

    return unregister;
  }, [onMessage, queryClient]);

  // Events sent while disconnected are lost, so the snapshot is reloaded.
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
    () => (snapshotQuery.data?.tags ?? []).toSorted((first, second) => first.name.localeCompare(second.name)),
    [snapshotQuery.data]
  );

  const entityIdsByTagId = useMemo(() => groupEntityIds(snapshotQuery.data?.edges ?? []), [snapshotQuery.data]);

  const getTags = useCallback(() => sortedTags, [sortedTags]);

  const getEntityIds = useCallback(
    (tagId: string, entityType: EntityType) => entityIdsByTagId.get(tagId)?.get(entityType) ?? EMPTY_ENTITY_IDS,
    [entityIdsByTagId]
  );

  const listStatus = useMemo<TagListStatus>(
    () => ({ isLoading: snapshotQuery.isLoading, error: snapshotQuery.error ?? undefined }),
    [snapshotQuery.isLoading, snapshotQuery.error]
  );

  const value = useMemo<TagsContextValue>(
    () => ({ getTags, getEntityIds, listStatus }),
    [getTags, getEntityIds, listStatus]
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

/** A new snapshot with one TAGS_CHANGED applied in field order: tags, removed edges, added edges, deleted tags */
function applyTagsChanged(snapshot: TagSnapshot, message: TagsChangedWsMessage): TagSnapshot {
  const upsertedTagIds = new Set(message.tags.map((tag) => tag.id));
  const tags = snapshot.tags.filter((tag) => !upsertedTagIds.has(tag.id)).concat(message.tags);

  const addedEdges = message.addedEdges.filter((edge) => edge.entity.entityType === SNAPSHOT_ENTITY_TYPE);
  const changedEdgeKeys = new Set(message.removedEdges.concat(addedEdges).map(toEdgeKey));
  const edges = snapshot.edges.filter((edge) => !changedEdgeKeys.has(toEdgeKey(edge))).concat(addedEdges);

  const deletedTagIds = new Set(message.deletedTagIds);

  return { tags: tags.filter((tag) => !deletedTagIds.has(tag.id)), edges };
}

function toEdgeKey(edge: TagEdge): string {
  return JSON.stringify([edge.tagId, edge.entity.entityType, edge.entity.id]);
}

function groupEntityIds(edges: TagEdge[]): EntityIdsByTagId {
  const entityIdsByTagId = new Map<string, Map<EntityType, string[]>>();
  for (const edge of edges) {
    let entityIdsByType = entityIdsByTagId.get(edge.tagId);
    if (!entityIdsByType) {
      entityIdsByType = new Map();
      entityIdsByTagId.set(edge.tagId, entityIdsByType);
    }

    const entityIds = entityIdsByType.get(edge.entity.entityType);
    if (entityIds) {
      entityIds.push(edge.entity.id);
    } else {
      entityIdsByType.set(edge.entity.entityType, [edge.entity.id]);
    }
  }

  return entityIdsByTagId;
}
