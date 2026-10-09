import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ENTITY_TYPE, SERVER_MESSAGE_TYPE, type EntityType, type TagSnapshot } from "@crow-central-agency/shared";
import { useWs } from "../hooks/use-ws.js";
import { apiClient, unwrapResponse } from "../services/api-client.js";
import type { ApiError } from "../services/api-client.types.js";
import { tagKeys } from "../services/query-keys.js";
import { WS_STATE } from "../services/ws-client.types.js";
import { TagsIndex } from "./tags-index.js";
import type { TagListStatus, TagsContextValue } from "./tags-provider.types.js";

const TAGS_PATH = "/tags";
const SNAPSHOT_ENTITY_TYPE = ENTITY_TYPE.NOTE;
const TRACKED_ENTITY_TYPES: ReadonlySet<EntityType> = new Set([SNAPSHOT_ENTITY_TYPE]);

const TagsContext = createContext<TagsContextValue | undefined>(undefined);

/**
 * The one owner of tag data. Loads the tag snapshot for the tracked entity
 * type into a private index, keeps it current from TAGS_CHANGED, and rebuilds
 * it from the snapshot after a WS reconnect.
 */
export function TagsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { onMessage, connectionState } = useWs();
  const [initialTagsIndex] = useState(() => new TagsIndex(TRACKED_ENTITY_TYPES));
  const tagsIndexRef = useRef(initialTagsIndex);
  const [tagsIndex, setTagsIndex] = useState(() => initialTagsIndex.snapshot());

  const snapshotQuery = useQuery<TagSnapshot, ApiError>({
    queryKey: tagKeys.snapshot(SNAPSHOT_ENTITY_TYPE),
    queryFn: async () => {
      const params = new URLSearchParams({ entityType: SNAPSHOT_ENTITY_TYPE });

      return unwrapResponse(await apiClient.get<TagSnapshot>(`${TAGS_PATH}?${params.toString()}`));
    },
    staleTime: Infinity,
    refetchOnMount: "always",
  });

  const publish = useCallback(() => {
    setTagsIndex(tagsIndexRef.current.snapshot());
  }, []);

  useLayoutEffect(() => {
    if (snapshotQuery.data) {
      tagsIndexRef.current.replace(snapshotQuery.data);
      publish();
    }
  }, [snapshotQuery.data, publish]);

  useEffect(() => {
    const unregister = onMessage((message) => {
      if (message.type === SERVER_MESSAGE_TYPE.TAGS_CHANGED) {
        tagsIndexRef.current.apply(message);
        publish();
      }
    });

    return unregister;
  }, [onMessage, publish]);

  // Events sent while disconnected are lost, so the snapshot is reloaded and the index rebuilt from it.
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

  const listStatus = useMemo<TagListStatus>(
    () => ({ isLoading: snapshotQuery.isLoading, error: snapshotQuery.error ?? undefined }),
    [snapshotQuery.isLoading, snapshotQuery.error]
  );

  const value = useMemo<TagsContextValue>(
    () => ({ getTags: tagsIndex.getTags, getEntityIds: tagsIndex.getEntityIds, listStatus }),
    [tagsIndex, listStatus]
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
