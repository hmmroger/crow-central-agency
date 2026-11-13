import {
  DATA_SOURCE_TYPE,
  type DataSourceType,
  type DocumentRef,
  type DocumentSearchHit,
} from "@crow-central-agency/shared";

/** Which hits the search narrows to; reset to ALL each time the palette opens */
export const DOCUMENT_PALETTE_FILTER = {
  ALL: "all",
  NOTES: "notes",
  ARTIFACTS: "artifacts",
  FRAGMENTS: "fragments",
} as const;

export type DocumentPaletteFilter = (typeof DOCUMENT_PALETTE_FILTER)[keyof typeof DOCUMENT_PALETTE_FILTER];

/** Pill order, which is also the Tab cycling order */
export const DOCUMENT_PALETTE_FILTERS: readonly DocumentPaletteFilter[] = [
  DOCUMENT_PALETTE_FILTER.ALL,
  DOCUMENT_PALETTE_FILTER.NOTES,
  DOCUMENT_PALETTE_FILTER.ARTIFACTS,
  DOCUMENT_PALETTE_FILTER.FRAGMENTS,
];

export const DOCUMENT_PALETTE_FILTER_LABEL: Record<DocumentPaletteFilter, string> = {
  [DOCUMENT_PALETTE_FILTER.ALL]: "All",
  [DOCUMENT_PALETTE_FILTER.NOTES]: "Notes",
  [DOCUMENT_PALETTE_FILTER.ARTIFACTS]: "Artifacts",
  [DOCUMENT_PALETTE_FILTER.FRAGMENTS]: "Fragments",
};

export const DOCUMENT_PALETTE_FILTER_SOURCES: Record<DocumentPaletteFilter, readonly DataSourceType[]> = {
  [DOCUMENT_PALETTE_FILTER.ALL]: [
    DATA_SOURCE_TYPE.NOTE,
    DATA_SOURCE_TYPE.ARTIFACT,
    DATA_SOURCE_TYPE.CIRCLE_ARTIFACT,
    DATA_SOURCE_TYPE.FRAGMENT,
  ],
  [DOCUMENT_PALETTE_FILTER.NOTES]: [DATA_SOURCE_TYPE.NOTE],
  [DOCUMENT_PALETTE_FILTER.ARTIFACTS]: [DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT],
  [DOCUMENT_PALETTE_FILTER.FRAGMENTS]: [DATA_SOURCE_TYPE.FRAGMENT],
};

/** Kind of document a palette row stands for; agent and circle artifacts are both ARTIFACT */
export const DOCUMENT_PALETTE_ENTRY_TYPE = {
  NOTE: "note",
  ARTIFACT: "artifact",
  FRAGMENT: "fragment",
} as const;

export type DocumentPaletteEntryType = (typeof DOCUMENT_PALETTE_ENTRY_TYPE)[keyof typeof DOCUMENT_PALETTE_ENTRY_TYPE];

export const DOCUMENT_PALETTE_ENTRY_TYPE_LABEL: Record<DocumentPaletteEntryType, string> = {
  [DOCUMENT_PALETTE_ENTRY_TYPE.NOTE]: "Note",
  [DOCUMENT_PALETTE_ENTRY_TYPE.ARTIFACT]: "Artifact",
  [DOCUMENT_PALETTE_ENTRY_TYPE.FRAGMENT]: "Fragment",
};

/** A document as the palette receives it: a full search hit when searching, a bare ref for Recent */
export type DocumentPaletteSource = DocumentRef & Partial<Pick<DocumentSearchHit, "title" | "tags">>;

export interface DocumentPaletteEntry {
  key: string;
  type: DocumentPaletteEntryType;
  title: string;
  subtitle?: string;
  /** What selecting the row opens */
  target: DocumentPaletteSource;
}

/** What a palette row does when selected */
export const DOCUMENT_PALETTE_ACTION = {
  OPEN_DOCUMENT: "open-document",
  NEW_NOTE: "new-note",
} as const;

export type DocumentPaletteValue =
  | { action: typeof DOCUMENT_PALETTE_ACTION.OPEN_DOCUMENT; entry: DocumentPaletteEntry }
  | { action: typeof DOCUMENT_PALETTE_ACTION.NEW_NOTE };

/** Subtitle of an artifact or fragment row; undefined when there is none, which drops an artifact */
export type DocumentSubtitleResolver = (document: DocumentPaletteSource) => string | undefined;

/** Dialog id, shared by the open hook and the palette hotkey */
export const DOCUMENT_PALETTE_DIALOG_ID = "document-palette";
/** Id of the sr-only heading naming the dialog */
export const DOCUMENT_PALETTE_LABEL_ID = "document-palette-label";
