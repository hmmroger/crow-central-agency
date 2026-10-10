export interface NoteNodesOptions {
  isTrashed: boolean;
  /** Only these notes, and what is under them, are included; every note when absent */
  includedIds?: ReadonlySet<string>;
}
