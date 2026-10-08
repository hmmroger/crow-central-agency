import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FileBox, FileText } from "lucide-react";
import { ENTITY_TYPE, type ArtifactEntityType, type ArtifactMetadata } from "@crow-central-agency/shared";
import { useCirclesQuery } from "../../../hooks/queries/use-circles-query.js";
import { useSearchQuery } from "../../../hooks/queries/use-search-query.js";
import { useDebouncedValue } from "../../../hooks/use-debounced-value.js";
import { useAgentsContext } from "../../../providers/agents-provider.js";
import { useNotesContext } from "../../../providers/notes-provider.js";
import { listAgentArtifacts, listCircleArtifacts, unwrapResponse } from "../../../services/api-client.js";
import { NOTES_SIDEBAR_TAB, useAppStore, VIEW_MODE } from "../../../stores/app-store.js";
import { getErrorMessage } from "../../../utils/error-message.js";
import { useOpenArtifactViewer } from "../../agents/artifact/use-open-artifact-viewer.js";
import { CommandPalette } from "../../common/command-palette/command-palette.js";
import { CommandPaletteSectionLabel } from "../../common/command-palette/command-palette-section-label.js";
import type { CommandPaletteItem } from "../../common/command-palette/command-palette.types.js";
import {
  NOTE_PALETTE_FILTER,
  NOTE_PALETTE_FILTER_SOURCES,
  NOTE_PALETTE_FILTERS,
  NOTE_PALETTE_LABEL_ID,
  NOTE_PALETTE_TARGET_KIND,
  type NotePaletteArtifactTarget,
  type NotePaletteFilter,
  type NotePaletteTarget,
} from "./note-palette.types.js";
import { resolveRecentNoteEntries, resolveSearchHitEntries } from "./resolve-note-palette-entries.js";
import { NotePaletteFilterPills } from "./note-palette-filter-pills.js";

interface NotePaletteDialogProps {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const NOTE_PALETTE_ID_PREFIX = "note-palette";
const SEARCH_DEBOUNCE_MS = 200;
const RECENT_LABEL = "Recent";
const RECENT_EMPTY_MESSAGE = "Type to search notes and artifacts.";
const RESULTS_EMPTY_MESSAGE = "No notes or artifacts match";
const MISSING_ARTIFACT_MESSAGE = "This artifact no longer exists";
const PALETTE_ICON_CLASS_NAME = "h-4 w-4";

function cycleFilter(filter: NotePaletteFilter, step: number): NotePaletteFilter {
  const count = NOTE_PALETTE_FILTERS.length;
  const nextIndex = (NOTE_PALETTE_FILTERS.indexOf(filter) + step + count) % count;
  return NOTE_PALETTE_FILTERS[nextIndex] ?? NOTE_PALETTE_FILTER.ALL;
}

async function fetchArtifactMetadata(target: NotePaletteArtifactTarget): Promise<ArtifactMetadata | undefined> {
  const query = { filename: target.filename };
  const response =
    target.ownerType === ENTITY_TYPE.AGENT
      ? await listAgentArtifacts(target.ownerId, query)
      : await listCircleArtifacts(target.ownerId, query);

  return unwrapResponse(response)[0];
}

export function NotePaletteDialog({ onClose }: NotePaletteDialogProps) {
  const notes = useNotesContext();
  const { getAgent } = useAgentsContext();
  const { data: circles } = useCirclesQuery();
  const recentNoteIds = useAppStore((state) => state.recentNoteIds);
  const currentNoteId = useAppStore((state) =>
    state.viewMode === VIEW_MODE.NOTES && state.notesSidebarTab === NOTES_SIDEBAR_TAB.NOTES
      ? state.selectedNoteId
      : undefined
  );
  const goToNote = useAppStore((state) => state.goToNote);
  const openArtifactViewer = useOpenArtifactViewer();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NotePaletteFilter>(NOTE_PALETTE_FILTER.ALL);
  const [artifactError, setArtifactError] = useState<string>();
  const isOpeningArtifactRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const search = useSearchQuery(isSearching ? debouncedQuery : "", NOTE_PALETTE_FILTER_SOURCES[filter]);
  const isLoading = isSearching && (debouncedQuery !== trimmedQuery || search.isFetching);

  const circleNames = useMemo(() => new Map(circles?.map((circle) => [circle.id, circle.name])), [circles]);

  const getOwnerName = useCallback(
    (ownerType: ArtifactEntityType, ownerId: string) =>
      ownerType === ENTITY_TYPE.AGENT ? getAgent(ownerId)?.name : circleNames.get(ownerId),
    [getAgent, circleNames]
  );

  const entries = useMemo(
    () =>
      isSearching
        ? resolveSearchHitEntries({ notes, hits: search.data ?? [], getOwnerName })
        : resolveRecentNoteEntries({ notes, recentNoteIds, currentNoteId }),
    [isSearching, notes, search.data, getOwnerName, recentNoteIds, currentNoteId]
  );

  const items = useMemo<CommandPaletteItem<NotePaletteTarget>[]>(
    () =>
      entries.map((entry) => ({
        key: entry.key,
        title: entry.title,
        subtitle: entry.subtitle,
        leading:
          entry.target.kind === NOTE_PALETTE_TARGET_KIND.NOTE ? (
            <FileText className={PALETTE_ICON_CLASS_NAME} />
          ) : (
            <FileBox className={PALETTE_ICON_CLASS_NAME} />
          ),
        value: entry.target,
      })),
    [entries]
  );

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    setArtifactError(undefined);
  }, []);

  const handleFilterChange = useCallback((nextFilter: NotePaletteFilter) => {
    setFilter(nextFilter);
    setArtifactError(undefined);
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!isSearching || event.key !== "Tab") {
        return;
      }

      event.preventDefault();
      handleFilterChange(cycleFilter(filter, event.shiftKey ? -1 : 1));
    },
    [isSearching, filter, handleFilterChange]
  );

  const openArtifact = useCallback(
    async (target: NotePaletteArtifactTarget) => {
      if (isOpeningArtifactRef.current) {
        return;
      }

      isOpeningArtifactRef.current = true;
      setArtifactError(undefined);
      try {
        const metadata = await fetchArtifactMetadata(target);
        if (!isMountedRef.current) {
          return;
        }

        if (!metadata) {
          setArtifactError(MISSING_ARTIFACT_MESSAGE);
          return;
        }

        onClose();
        openArtifactViewer(metadata);
      } catch (error) {
        if (isMountedRef.current) {
          setArtifactError(getErrorMessage(error));
        }
      } finally {
        isOpeningArtifactRef.current = false;
      }
    },
    [onClose, openArtifactViewer]
  );

  const handleSelect = useCallback(
    (target: NotePaletteTarget) => {
      if (target.kind === NOTE_PALETTE_TARGET_KIND.ARTIFACT) {
        void openArtifact(target);
        return;
      }

      goToNote(target.noteId);
      onClose();
    },
    [openArtifact, goToNote, onClose]
  );

  const searchError = isSearching && search.isError ? getErrorMessage(search.error) : undefined;

  return (
    <CommandPalette
      idPrefix={NOTE_PALETTE_ID_PREFIX}
      labelId={NOTE_PALETTE_LABEL_ID}
      title="Find note"
      inputLabel="Search notes and artifacts"
      placeholder="Search notes and artifacts…"
      query={query}
      onQueryChange={handleQueryChange}
      onInputKeyDown={handleInputKeyDown}
      resetKey={`${filter}:${trimmedQuery}`}
      header={
        isSearching ? (
          <NotePaletteFilterPills filter={filter} onFilterChange={handleFilterChange} />
        ) : (
          <CommandPaletteSectionLabel label={RECENT_LABEL} />
        )
      }
      items={items}
      isLoading={isLoading}
      emptyMessage={isSearching ? RESULTS_EMPTY_MESSAGE : RECENT_EMPTY_MESSAGE}
      errorMessage={artifactError ?? searchError}
      onSelect={handleSelect}
    />
  );
}
