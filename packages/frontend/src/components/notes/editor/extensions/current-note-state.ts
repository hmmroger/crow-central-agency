import { Facet, type EditorState, type Extension } from "@codemirror/state";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { getNotesTree } from "./notes-tree-state.js";

const currentNoteIdFacet = Facet.define<string, string | undefined>({
  combine: (noteIds) => noteIds[0],
});

/** The id of the note being edited; `undefined` when the editor is not bound to one. */
export function getCurrentNoteId(state: EditorState): string | undefined {
  return state.facet(currentNoteIdFacet);
}

/** The note being edited, as the notes tree currently describes it. */
export function getCurrentNote(state: EditorState): NoteMetadata | undefined {
  const noteId = getCurrentNoteId(state);

  return noteId === undefined ? undefined : getNotesTree(state).find((metadata) => metadata.id === noteId);
}

/** Binds the editor to the note `noteId`, which image paste, wikilink creation and autocomplete act relative to. */
export function currentNote(noteId: string): Extension {
  return currentNoteIdFacet.of(noteId);
}
