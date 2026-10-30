import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FileBox, FilePlus, FileText } from "lucide-react";
import { DATA_SOURCE_TYPE, type ArtifactMetadata, type DocumentRef } from "@crow-central-agency/shared";
import { useCirclesQuery } from "../../hooks/queries/use-circles-query.js";
import { useSearchQuery } from "../../hooks/queries/use-search-query.js";
import { useDebouncedValue } from "../../hooks/use-debounced-value.js";
import { useAgentsContext } from "../../providers/agents-provider.js";
import { useNotesContext } from "../../providers/notes-provider.js";
import { listAgentArtifacts, listCircleArtifacts, unwrapResponse } from "../../services/api-client.js";
import { NOTES_SIDEBAR_TAB, useAppStore, VIEW_MODE } from "../../stores/app-store.js";
import { getErrorMessage } from "../../utils/error-message.js";
import { useOpenArtifactViewer } from "../agents/artifact/use-open-artifact-viewer.js";
import { CommandPalette } from "../common/command-palette/command-palette.js";
import { CommandPaletteSectionLabel } from "../common/command-palette/command-palette-section-label.js";
import type { CommandPaletteItem } from "../common/command-palette/command-palette.types.js";
import { useNewNote } from "../notes/use-new-note.js";
import {
  DOCUMENT_PALETTE_ACTION,
  DOCUMENT_PALETTE_FILTER,
  DOCUMENT_PALETTE_FILTER_SOURCES,
  DOCUMENT_PALETTE_FILTERS,
  DOCUMENT_PALETTE_LABEL_ID,
  type DocumentPaletteFilter,
  type DocumentPaletteValue,
} from "./document-palette.types.js";
import { resolveDocumentPaletteEntries } from "./resolve-document-palette-entries.js";
import { DocumentPaletteFilterPills } from "./document-palette-filter-pills.js";

interface DocumentPaletteDialogProps {
  /** Injected by ModalDialogRenderer */
  onClose: () => void;
}

const DOCUMENT_PALETTE_ID_PREFIX = "document-palette";
const SEARCH_DEBOUNCE_MS = 200;
const RECENT_LABEL = "Recent";
const RESULTS_EMPTY_MESSAGE = "No notes or artifacts match";
const MISSING_ARTIFACT_MESSAGE = "This artifact no longer exists";
const NEW_NOTE_KEY = "new-note";
const NEW_NOTE_TITLE = "New note";
const PALETTE_ICON_CLASS_NAME = "h-4 w-4";

function cycleFilter(filter: DocumentPaletteFilter, step: number): DocumentPaletteFilter {
  const count = DOCUMENT_PALETTE_FILTERS.length;
  const nextIndex = (DOCUMENT_PALETTE_FILTERS.indexOf(filter) + step + count) % count;
  return DOCUMENT_PALETTE_FILTERS[nextIndex] ?? DOCUMENT_PALETTE_FILTER.ALL;
}

async function fetchArtifactMetadata(documentRef: DocumentRef): Promise<ArtifactMetadata | undefined> {
  const query = { filename: documentRef.documentId };
  switch (documentRef.dataSourceType) {
    case DATA_SOURCE_TYPE.ARTIFACT:
      return unwrapResponse(await listAgentArtifacts(documentRef.provenanceId, query))[0];

    case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
      return unwrapResponse(await listCircleArtifacts(documentRef.provenanceId, query))[0];

    case DATA_SOURCE_TYPE.NOTE:
    case DATA_SOURCE_TYPE.TASK:
    case DATA_SOURCE_TYPE.FRAGMENT:
      return undefined;
  }
}

export function DocumentPaletteDialog({ onClose }: DocumentPaletteDialogProps) {
  const notes = useNotesContext();
  const { getAgent } = useAgentsContext();
  const { data: circles } = useCirclesQuery();
  const recentDocuments = useAppStore((state) => state.recentDocuments);
  const forgetRecentDocument = useAppStore((state) => state.forgetRecentDocument);
  const currentNoteId = useAppStore((state) =>
    state.viewMode === VIEW_MODE.NOTES && state.notesSidebarTab === NOTES_SIDEBAR_TAB.NOTES
      ? state.selectedNoteId
      : undefined
  );
  const goToNote = useAppStore((state) => state.goToNote);
  const openArtifactViewer = useOpenArtifactViewer();
  const { destinationName, createNewNote } = useNewNote();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocumentPaletteFilter>(DOCUMENT_PALETTE_FILTER.ALL);
  const [actionError, setActionError] = useState<string>();
  const isPendingRef = useRef(false);
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
  const search = useSearchQuery(isSearching ? debouncedQuery : "", DOCUMENT_PALETTE_FILTER_SOURCES[filter]);
  const isLoading = isSearching && (debouncedQuery !== trimmedQuery || search.isFetching);

  const circleNames = useMemo(() => new Map(circles?.map((circle) => [circle.id, circle.name])), [circles]);

  const getOwnerName = useCallback(
    (documentRef: DocumentRef) => {
      switch (documentRef.dataSourceType) {
        case DATA_SOURCE_TYPE.ARTIFACT:
          return getAgent(documentRef.provenanceId)?.name;

        case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
          return circleNames.get(documentRef.provenanceId);

        case DATA_SOURCE_TYPE.NOTE:
        case DATA_SOURCE_TYPE.TASK:
        case DATA_SOURCE_TYPE.FRAGMENT:
          return undefined;
      }
    },
    [getAgent, circleNames]
  );

  const entries = useMemo(
    () =>
      isSearching
        ? resolveDocumentPaletteEntries({ notes, documents: search.data ?? [], getOwnerName })
        : resolveDocumentPaletteEntries({
            notes,
            documents: recentDocuments,
            getOwnerName,
            excludedNoteId: currentNoteId,
          }),
    [isSearching, notes, search.data, getOwnerName, recentDocuments, currentNoteId]
  );

  const items = useMemo(() => {
    const paletteItems: CommandPaletteItem<DocumentPaletteValue>[] = entries.map((entry) => ({
      key: entry.key,
      title: entry.title,
      subtitle: entry.subtitle,
      leading:
        entry.target.dataSourceType === DATA_SOURCE_TYPE.NOTE ? (
          <FileText className={PALETTE_ICON_CLASS_NAME} />
        ) : (
          <FileBox className={PALETTE_ICON_CLASS_NAME} />
        ),
      value: { action: DOCUMENT_PALETTE_ACTION.OPEN_DOCUMENT, target: entry.target },
    }));

    if (!isSearching) {
      paletteItems.push({
        key: NEW_NOTE_KEY,
        title: NEW_NOTE_TITLE,
        subtitle: destinationName,
        leading: <FilePlus className={PALETTE_ICON_CLASS_NAME} />,
        value: { action: DOCUMENT_PALETTE_ACTION.NEW_NOTE },
      });
    }

    return paletteItems;
  }, [entries, isSearching, destinationName]);

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    setActionError(undefined);
  }, []);

  const handleFilterChange = useCallback((nextFilter: DocumentPaletteFilter) => {
    setFilter(nextFilter);
    setActionError(undefined);
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
    async (target: DocumentRef) => {
      isPendingRef.current = true;
      setActionError(undefined);
      try {
        const metadata = await fetchArtifactMetadata(target);
        if (!metadata) {
          forgetRecentDocument(target);
        }

        if (!isMountedRef.current) {
          return;
        }

        if (!metadata) {
          setActionError(MISSING_ARTIFACT_MESSAGE);
          return;
        }

        onClose();
        openArtifactViewer(metadata);
      } catch (error) {
        if (isMountedRef.current) {
          setActionError(getErrorMessage(error));
        }
      } finally {
        isPendingRef.current = false;
      }
    },
    [onClose, openArtifactViewer, forgetRecentDocument]
  );

  const createNote = useCallback(async () => {
    isPendingRef.current = true;
    setActionError(undefined);
    try {
      const noteId = await createNewNote();
      if (!isMountedRef.current) {
        return;
      }

      onClose();
      goToNote(noteId);
    } catch (error) {
      if (isMountedRef.current) {
        setActionError(getErrorMessage(error));
      }
    } finally {
      isPendingRef.current = false;
    }
  }, [createNewNote, onClose, goToNote]);

  const openDocument = useCallback(
    (target: DocumentRef) => {
      switch (target.dataSourceType) {
        case DATA_SOURCE_TYPE.NOTE:
          goToNote(target.documentId);
          onClose();
          return;

        case DATA_SOURCE_TYPE.ARTIFACT:
        case DATA_SOURCE_TYPE.CIRCLE_ARTIFACT:
          void openArtifact(target);
          return;

        case DATA_SOURCE_TYPE.TASK:
        case DATA_SOURCE_TYPE.FRAGMENT:
          return;
      }
    },
    [openArtifact, goToNote, onClose]
  );

  const handleSelect = useCallback(
    (value: DocumentPaletteValue) => {
      if (isPendingRef.current) {
        return;
      }

      switch (value.action) {
        case DOCUMENT_PALETTE_ACTION.OPEN_DOCUMENT:
          openDocument(value.target);
          return;

        case DOCUMENT_PALETTE_ACTION.NEW_NOTE:
          void createNote();
          return;
      }
    },
    [openDocument, createNote]
  );

  const searchError = isSearching && search.isError ? getErrorMessage(search.error) : undefined;

  return (
    <CommandPalette
      idPrefix={DOCUMENT_PALETTE_ID_PREFIX}
      labelId={DOCUMENT_PALETTE_LABEL_ID}
      title="Find note or artifact"
      inputLabel="Search notes and artifacts"
      placeholder="Search notes and artifacts…"
      query={query}
      onQueryChange={handleQueryChange}
      onInputKeyDown={handleInputKeyDown}
      resetKey={`${filter}:${trimmedQuery}`}
      header={
        isSearching ? (
          <DocumentPaletteFilterPills filter={filter} onFilterChange={handleFilterChange} />
        ) : (
          <CommandPaletteSectionLabel label={RECENT_LABEL} />
        )
      }
      items={items}
      isLoading={isLoading}
      emptyMessage={RESULTS_EMPTY_MESSAGE}
      errorMessage={actionError ?? searchError}
      onSelect={handleSelect}
    />
  );
}
