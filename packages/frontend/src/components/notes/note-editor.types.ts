/** Imperative handle a `NoteEditor` exposes to the surface that hosts it */
export interface NoteEditorHandle {
  /** Writes any pending draft now; resolves `false` when that save fails and the draft is not on the backend */
  flush: () => Promise<boolean>;
}
