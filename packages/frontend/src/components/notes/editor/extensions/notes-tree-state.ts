import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { hashKey } from "@tanstack/react-query";
import type { NoteMetadata } from "@crow-central-agency/shared";
import { queryClient } from "../../../../services/query-client.js";
import { noteKeys } from "../../../../services/query-keys.js";

export const setNotesTree = StateEffect.define<NoteMetadata[]>();

const NOTES_TREE_QUERY_HASH = hashKey(noteKeys.tree());

function readCachedNotesTree(): NoteMetadata[] | undefined {
  return queryClient.getQueryData<NoteMetadata[]>(noteKeys.tree());
}

const notesTreeField = StateField.define<NoteMetadata[]>({
  create: () => readCachedNotesTree() ?? [],
  update: (notes, transaction) =>
    transaction.effects.reduce((current, effect) => (effect.is(setNotesTree) ? effect.value : current), notes),
});

/** The notes tree query's data, copied into state whenever the cache holds a new tree. */
class NotesTreeSync {
  private readonly unsubscribe: () => void;

  constructor(private readonly view: EditorView) {
    // Cache notifications are batched onto a later task, so this never dispatches inside an update.
    this.unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash === NOTES_TREE_QUERY_HASH) {
        this.syncNotesTree();
      }
    });
  }

  public destroy(): void {
    this.unsubscribe();
  }

  private syncNotesTree(): void {
    const notes = readCachedNotesTree();

    if (notes && notes !== this.view.state.field(notesTreeField)) {
      this.view.dispatch({ effects: setNotesTree.of(notes) });
    }
  }
}

/** The live notes tree for resolving wikilinks; empty when the extension is not installed. */
export function getNotesTree(state: EditorState): NoteMetadata[] {
  return state.field(notesTreeField, false) ?? [];
}

export function notesTree(): Extension {
  return [notesTreeField, ViewPlugin.fromClass(NotesTreeSync)];
}
