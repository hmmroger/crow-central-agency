export interface FindQuery {
  text: string;
  isCaseSensitive: boolean;
}

export interface FindResult {
  /** Omitted when nothing matches */
  currentIndex?: number;
  total: number;
}

/** What a searchable surface takes from its host */
export interface FindSurfaceHandle {
  setQuery: (query: FindQuery) => void;
  next: () => void;
  previous: () => void;
  clear: () => void;
  /** The surface's non-empty selection, to start the query from */
  getSelectionQuery: () => string | undefined;
  focus: () => void;
}

/** One searchable unit's text, as the matcher sees it */
export interface FindItem {
  id: string;
  text: string;
}

export interface FindRange {
  start: number;
  end: number;
}

export interface FindMatch extends FindRange {
  itemId: string;
}
