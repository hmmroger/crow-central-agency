import { DATA_SOURCE_TYPE, type DataSourceType, type DocumentRef } from "@crow-central-agency/shared";

/** Which hits the search narrows to; reset to ALL each time the palette opens */
export const NOTE_PALETTE_FILTER = {
  ALL: "all",
  NOTES: "notes",
  ARTIFACTS: "artifacts",
} as const;

export type NotePaletteFilter = (typeof NOTE_PALETTE_FILTER)[keyof typeof NOTE_PALETTE_FILTER];

/** Pill order, which is also the Tab cycling order */
export const NOTE_PALETTE_FILTERS: readonly NotePaletteFilter[] = [
  NOTE_PALETTE_FILTER.ALL,
  NOTE_PALETTE_FILTER.NOTES,
  NOTE_PALETTE_FILTER.ARTIFACTS,
];

export const NOTE_PALETTE_FILTER_LABEL: Record<NotePaletteFilter, string> = {
  [NOTE_PALETTE_FILTER.ALL]: "All",
  [NOTE_PALETTE_FILTER.NOTES]: "Notes",
  [NOTE_PALETTE_FILTER.ARTIFACTS]: "Artifacts",
};

export const NOTE_PALETTE_FILTER_SOURCES: Record<NotePaletteFilter, readonly DataSourceType[]> = {
  [NOTE_PALETTE_FILTER.ALL]: [DATA_SOURCE_TYPE.NOTE, DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT],
  [NOTE_PALETTE_FILTER.NOTES]: [DATA_SOURCE_TYPE.NOTE],
  [NOTE_PALETTE_FILTER.ARTIFACTS]: [DATA_SOURCE_TYPE.ARTIFACT, DATA_SOURCE_TYPE.CIRCLE_ARTIFACT],
};

export interface NotePaletteEntry {
  key: string;
  title: string;
  subtitle?: string;
  /** What selecting the row opens */
  target: DocumentRef;
}

/** Display name of the agent or circle a document belongs to; undefined when it has no such owner or the owner is gone */
export type DocumentOwnerNameResolver = (documentRef: DocumentRef) => string | undefined;

/** Dialog id, shared by the open hook and the palette hotkey */
export const NOTE_PALETTE_DIALOG_ID = "note-palette";
/** Id of the sr-only heading naming the dialog */
export const NOTE_PALETTE_LABEL_ID = "note-palette-label";
