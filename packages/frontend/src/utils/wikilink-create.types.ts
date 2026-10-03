/** Where an unresolved `[[target]]` is created, relative to what already exists. */
export interface WikilinkCreatePlan {
  /** The existing folder that receives the first missing folder, or the note; `undefined` is the notes root */
  parentId?: string;
  /** Folders to create in order, each inside the one before */
  missingFolderNames: string[];
  /** Name of the text note to create */
  noteName: string;
}
