import { DATA_SOURCE_TYPE, type DataSourceType, type DocumentRef } from "@crow-central-agency/shared";

/** Which hits the search narrows to; reset to ALL each time the palette opens */
export const DOCUMENT_PALETTE_FILTER = {
  ALL: "all",
  NOTES: "notes",
  ARTIFACTS: "artifacts",
} as const;

export type DocumentPaletteFilter = (typeof DOCUMENT_PALETTE_FILTER)[keyof typeof DOCUMENT_PALETTE_FILTER];

/** Pill order, which is also the Tab cycling order */
export const DOCUMENT_PALETTE_FILTERS: readonly DocumentPaletteFilter[] = [
  DOCUMENT_PALETTE_FILTER.ALL,
  DOCUMENT_PALETTE_FILTER.NOTES,
  DOCUMENT_PALETTE_FILTER.ARTIFACTS,
];

export const DOCUMENT_PALETTE_FILTER_LABEL: Record<DocumentPaletteFilter, string> = {
  [DOCUMENT_PALETTE_FILTER.ALL]: "All",
  [DOCUMENT_PALETTE_FILTER.NOTES]: "Notes",
  [DOCUMENT_PALETTE_FILTER.ARTIFACTS]: "Artifacts",
};

export const DOCUMENT_PALETTE_FILTER_SOURCES: Record<DocumentPaletteFilter, readonly DataSourceType[]> = {
  [DOCUMENT_PALETTE_FILTER.ALL]: [DATA_SOURCE_TYPE.NOTE, DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT],
  [DOCUMENT_PALETTE_FILTER.NOTES]: [DATA_SOURCE_TYPE.NOTE],
  [DOCUMENT_PALETTE_FILTER.ARTIFACTS]: [DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT],
};

export interface DocumentPaletteEntry {
  key: string;
  title: string;
  subtitle?: string;
  /** What selecting the row opens */
  target: DocumentRef;
}

/** Display name of the agent or circle a document belongs to; undefined when it has no such owner or the owner is gone */
export type DocumentOwnerNameResolver = (documentRef: DocumentRef) => string | undefined;

/** Dialog id, shared by the open hook and the palette hotkey */
export const DOCUMENT_PALETTE_DIALOG_ID = "document-palette";
/** Id of the sr-only heading naming the dialog */
export const DOCUMENT_PALETTE_LABEL_ID = "document-palette-label";
